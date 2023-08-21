import { simplifySearchResults } from '@/agents/common/tools/webSearch';
import { AgentStatus, AgentTask, Message } from '@/types';
import axios from 'axios';
import { getTaskById } from '@/utils/task';
import { analystPrompt } from '../prompt';
import { textCompletionTool } from '../../common/tools/textCompletionTool';
import { largeTextExtract } from './largeTextExtract';
import { translate } from '@/utils/translate';
import { SimilarDoc } from '@/types';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { getUserApiKey } from '@/utils/settings';
import { findMostRelevantExamplesByType } from '@/utils/objective';

export const searchFilings = async (
	objective: string,
	task: AgentTask,
	dependentTaskOutputs: string,
	messageCallback: (message: Message) => void,
	modelName: string,
	verbose: boolean,
	language: string,
	isRunningRef?: React.MutableRefObject<boolean>,
	signal?: AbortSignal,
) => {
	const relevantQueryExample = await findMostRelevantExamplesByType(task.task, 'filingSearchQuery');
	const exampleTask = relevantQueryExample.task;
	const exampleDependentTaskOutput = relevantQueryExample.dependent_task_output;
	const exampleObjective = relevantQueryExample.objective;
	const exampleSearchQuery = relevantQueryExample.search_query;

	const queryPrompt = `Generate a search query to be used in a semantic search of excerpts from public company SEC Filings based on the task, dependent task outputs, the objective.
    Only return the search query. Do not include the company name or type of filing.
    EXAMPLE TASK=${exampleTask}
    DEPENDENT_TASK_OUTPUT=${exampleDependentTaskOutput}
    OBJECTIVE=${exampleObjective}
    SEARCH_QUERY="${exampleSearchQuery}"

	TASK=${task.task}
    DEPENDENT_TASK_OUTPUT=${dependentTaskOutputs}
    OBJECTIVE=${objective}
    SEARCH_QUERY=
  `;
  	console.log(queryPrompt)
	const query = await textCompletionTool(
		queryPrompt,
		modelName,
		signal,
		task.id,
		//messageCallback,
	);
    const symbolPrompt = `Return the ticker symbol of the company that is the subject of the task and objective.
    Only return the ticker symbol with no other commentary. 
    Task: ${task.task}
    Objective: ${objective}
  `;
	
	const symbol = await textCompletionTool(
		symbolPrompt,
		modelName,
		signal,
		task.id,
		//messageCallback,
	);
    let quarterList: any;
    if (symbol !== 'none') {
      // get most recently reported calendar quarter from db.
      const mostrecentlyReportedQuarter = 'Q1 2023';
      const timePeriodPrompt = `Generate a list of financial reporting periods for ${symbol} based on the most recently reported period, task, and the objective.
	  	If the task only refers to a single period, feel free to only return that period. 
	 	Your response must be a JSON object with the key timePeriods. 
        Most Recently Reported Period: ${mostrecentlyReportedQuarter}
        Task: ${task.task}
        Objective: ${objective}
      `;

	  const response = await textCompletionTool(
		timePeriodPrompt,
		modelName,
		signal,
		task.id,
		//messageCallback,
	);
      quarterList = JSON.parse(response);
	  if (Object.keys(quarterList).includes('timePeriods')) {
		quarterList = quarterList.timePeriods.map((a: string) => Number(`${a.split(' ')[1]}${a.split(' ')[0][1]}`))
	  }
    }

	const trimmedQuery = query.replace(/^"|"$/g, ''); // remove quotes from the search query
	
	let title = `🗄 Searching Filings`;
	let message = `Search query: ${trimmedQuery}\nSymbol ${symbol}\nQuarter List: ${quarterList}\n`;
	if (verbose) {
		console.log(message);
	}
	let statusMessage = message
	callbackSearchStatus(title, statusMessage, task, messageCallback);
	
	callbackTaskParameters('🗄 Filing Parameters', JSON.stringify({query: trimmedQuery, symbol, quarterList}),task, messageCallback)

	

	const searchResults = await searchFilingsApi(trimmedQuery, symbol, quarterList, signal);
    
	if (!searchResults?.length) return 
	if (!isRunningRef?.current) return;

	
	title = `📖 Reading content...`;
	message = `✅ Completed search. \nNow reading content.\n`;
	if (verbose) {
		console.log(message);
	}

	statusMessage += message;
	callbackSearchStatus(title, statusMessage, task, messageCallback);

	if (!isRunningRef.current) return;

	let results = '';
	let index = 1;
	let completedCount = 0;
	const MaxCompletedCount = 5;
	// Loop through search results
	for (const searchResult of searchResults) {
		if (!isRunningRef.current) return;
		if (completedCount >= MaxCompletedCount) break;


		const url = searchResult.title;
		let title = `${index}. Reading: ${url} ...`;

		if (verbose) {
			console.log(message);
		}
		statusMessage += `${title}\n`;
		callbackSearchStatus(title, statusMessage, task, messageCallback);

		let content = searchResult.text ?? '';

		title = `${index}. Extracting relevant info...`;
		message = `  - Content reading completed. Length:${content.length}. Now extracting relevant info...\n`;

		if (verbose) {
			console.log(message);
		}
		title = `${index}. Filing excerpt...`;
		statusMessage += content + '\n';
		callbackSearchStatus(title, statusMessage, task, messageCallback);
		statusMessage += message;
		callbackSearchStatus(title, statusMessage, task, messageCallback);

		if (content.length === 0) {
			let message = `  - Content too short. Skipped. \n`;
			if (verbose) console.log(message);
			statusMessage += message;
			callbackSearchStatus(undefined, statusMessage, task, messageCallback);
			index += 1;
			continue;
		}

		if (!isRunningRef.current) return;

		// extract relevant text from the scraped text
		const callback = (message: string) => {
			if (verbose) {
				console.log(message);
			}
			statusMessage = `${statusMessage}${message}`;
			title = `${index}. Extracting relevant info... ${message}`;
			callbackSearchStatus(title, statusMessage, task, messageCallback);
		};

		statusMessage += `  - Extracting relevant information\n`;
		title = `${index}. Extracting relevant info...`;
		callbackSearchStatus(title, statusMessage, task, messageCallback);

		content = `The following information is from ${searchResult.title}:\n${content}`
		
		const info = await largeTextExtract(
			objective,
			content,
			task,
			isRunningRef,
			callback,
			signal,
		);

		message = `  - Relevant info: ${info.slice(0, 500).replace(/\r?\n/g, '')} ...\n`;
		if (verbose) {
			console.log(info);
		}
		statusMessage += message;
		title = `${index}. Relevant info...`;
		callbackSearchStatus(title, statusMessage, task, messageCallback);

		results += `Notes from Document ${index}:\n${info}.\n\n`;
		index += 1;
		completedCount += 1;
	}

	if (!isRunningRef.current) return;

	callbackSearchStatus(
		'Analyzing results...',
		`${statusMessage}Analyze results...`,
		task,
		messageCallback,
	);

	const ap = analystPrompt(results, task.task, language);
	const analyzedResults = await textCompletionTool(
		ap,
		modelName,
		signal,
		task.id,
		messageCallback,
	);

	// callback to search logs
	const msg: Message = {
		type: 'search-logs',
		text: '```markdown\n' + statusMessage + '\n```',
		title: `🔎 ${translate('SEARCH_LOGS', 'message')}`,
		id: task.id,
		icon: '🌐',
		open: false,
	};
	messageCallback(msg);

	return { output: analyzedResults, parameters: { query, symbol, quarterList } };
};

const callbackSearchStatus = (
	title: string | undefined,
	message: string,
	task: AgentTask,
	messageCallback: (message: Message) => void,
) => {
	messageCallback({
		type: 'search-logs',
		title: title ?? translate('SEARCH_LOGS', 'message'),
		text: '```markdown\n' + message + '\n```',
		id: task.id,
		icon: '🌐',
		open: false,
	});
};
const callbackTaskParameters = (
	title: string | undefined,
	message: string,
	task: AgentTask,
	messageCallback: (message: Message) => void,
) => {
	messageCallback({
		type: 'task-parameters',
		title: title ?? '',
		text: message,
		id: task.id,
		icon: '🗄',
		open: true,
	});
};
const searchFilingsApi = async (query: string, symbol: string, quarterList?: number[], signal?: AbortSignal): Promise<SimilarDoc[] | null> => {
	const response = await axios
		.post(
			'/api/tools/filingsearch',
			{
				query,
				symbol,
				quarterList
			},
			{
				signal,
			},
		)
		.catch((error) => {
			if (error.name === 'AbortError') {
				console.log('Request aborted', error.message);
			} else {
				console.log(error.message);
			}
		});
	return response?.data.response;
};


