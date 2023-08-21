import Airtable from 'airtable';
import { Skill, SkillType } from '../skill';
import { AgentTask, ExecuteSkillOutput, Message, SimilarDoc } from '@/types';
import axios from 'axios';
import { translate } from '@/utils/translate';
import { textCompletionTool } from '@/agents/common/tools/textCompletionTool';
import { largeTextExtract } from '@/agents/babydeeragi/tools/largeTextExtract';
import { analystPrompt } from '@/agents/babydeeragi/prompt';
import { findMostRelevantExamplesByType } from '@/utils/objective';
import { AIChatMessage, HumanChatMessage, SystemChatMessage } from 'langchain/schema';

export class TranscriptSearch extends Skill {
  name = 'transcript_search';
  descriptionForHuman =
    'Searches available public company conference call transcripts.';
  descriptionForModel =
    'Semantic search of public company conference call transcripts.';
  icon = '📞';
  type: SkillType = 'dev';

  apiKeysRequired = ['pinecone'];

  async execute(
    task: AgentTask,
    dependentTaskOutputs: string,
    objective: string,
  ): Promise<ExecuteSkillOutput> {
    if (!this.valid) {
      return { output: '' };
    }
    const relevantQueryExample = await findMostRelevantExamplesByType(
      task.task,
      'transcriptSearchQuery',
    );

    const queryPrompt = `
Your task is to generate suitable search queries for a semantic search in a vector database containing extracts from company earnings call transcripts. 
The objective of the search is to find information about a specific metric or topic discussed in an earnings call transcript.  
Below is an instructive example followed by the real assignment.
${
  relevantQueryExample
    ? `EXAMPLE OBJECTIVE=${relevantQueryExample.objective}
TASK=${relevantQueryExample.task}
${
  relevantQueryExample.dependent_task_output.length
    ? `DEPENDENT_TASKS_OUTPUTS=${relevantQueryExample.dependent_task_output}`
    : undefined
}
SEARCH_QUERY=${relevantQueryExample.search_query}

`
    : ''
}
Focus on the key elements, keywords, and context of the request, but exclude the name of the company, any references to transcripts or conference calls, and any specific time periods from your search queries. 
Put your search queries in a JSON list of strings. Do not provide any additional information or analysis, only the search terms.


OBJECTIVE=${objective}
TASK=${task.task}
${dependentTaskOutputs.length ? `DEPENDENT_TASKS_OUTPUTS=${dependentTaskOutputs}` : ''}
SEARCH_QUERY=
  `;
  console.log(queryPrompt)
    const query =
      task.parameters?.query ??
      (await textCompletionTool(
        queryPrompt,
        this.modelName,
        this.abortController.signal,
        task.id,
        this.messageCallback,
      ));
    const symbolPrompt = `Return the ticker symbol of the company that is the subject of the task and objective.
    Only return the ticker symbol with no other commentary. 
    Task: ${task.task}
    Objective: ${objective}
  `;

    const symbol =
      task.parameters?.symbol ??
      (await textCompletionTool(
        symbolPrompt,
        this.modelName,
        this.abortController.signal,
        task.id,
        this.messageCallback,
      ));
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
      const queryListAsync = async () => {
        let quarterList: any;
        const response = await textCompletionTool(
          timePeriodPrompt,
          this.modelName,
          this.abortControllersignal,
          task.id,
          this.messageCallback,
        );
        quarterList = JSON.parse(response);

        if (Object.keys(quarterList).includes('timePeriods')) {
          quarterList = quarterList.timePeriods.map((a: string) =>
            Number(`${a.split(' ')[1]}${a.split(' ')[0][1]}`),
          );
          return quarterList;
        }
      };
      quarterList = task.parameters?.quarterList ?? (await queryListAsync());
    }

    const trimmedQuery = query //.replace(/^"|"$/g, ''); // remove quotes from the search query

    let title = `📞 Searching Call Transcripts: ${trimmedQuery}`;
    let message = `Search query: ${trimmedQuery}\nSymbol ${symbol}\nQuarter List: ${quarterList}\n`;
    if (this.verbose) {
      console.log(message);
    }
    let statusMessage = message;
    this.callbackSearchStatus(title, statusMessage, task, this.messageCallback);

    const searchResults = await this.searchTranscriptsApi(
      trimmedQuery,
      symbol,
      quarterList,
      this.abortController.signal,
    );

    if (!searchResults?.length) return { output: '' };
    if (!this.isRunningRef?.current) return { output: '' };

    title = `📖 Reading content...`;
    message = `✅ Completed search. \nNow reading content.\n`;
    if (this.verbose) {
      console.log(message);
    }

    statusMessage += message;
    this.callbackSearchStatus(title, statusMessage, task, this.messageCallback);

    if (!this.isRunningRef.current) return { output: '' };

    let results = '';
    let index = 1;
    let completedCount = 0;
    const MaxCompletedCount = 5;
    // Loop through search results
    for (const searchResult of searchResults) {
      if (!this.isRunningRef.current) return { output: '' };
      if (completedCount >= MaxCompletedCount) break;

      // Extract the URL from the search result
      const url = searchResult.title;
      let title = `${index}. Reading: ${url} ...`;

      if (this.verbose) {
        console.log(title);
      }
      statusMessage += `${title}\n`;
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      let content = searchResult.text ?? '';

      title = `${index}. Extracting relevant info...`;
      message = `  - Content reading completed. Length:${content.length}. Now extracting relevant info...\n`;

      if (this.verbose) {
        console.log(message);
      }
      statusMessage += message;
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      title = `${index}. Transcript excerpt...`;
      message = content;
      if (this.verbose) {
        console.log(message);
      }
      statusMessage += message + '\n';
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      if (content.length === 0) {
        let message = `  - Content too short. Skipped. \n`;
        if (this.verbose) console.log(message);
        statusMessage += message;
        this.callbackSearchStatus(
          undefined,
          statusMessage,
          task,
          this.messageCallback,
        );
        index += 1;
        continue;
      }

      if (!this.isRunningRef.current) return { output: '' };

      // extract relevant text from the scraped text
      const callback = (message: string) => {
        if (this.verbose) {
          console.log(message);
        }
        statusMessage = `${statusMessage}${message}`;
        title = `${index}. Extracting relevant info... ${message}`;
        this.callbackSearchStatus(
          title,
          statusMessage,
          task,
          this.messageCallback,
        );
      };

      statusMessage += `  - Extracting relevant information\n`;
      title = `${index}. Extracting relevant info...`;
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      content = `The following information is from ${searchResult.title}:\n${content}`;

      const info = await largeTextExtract(
        objective,
        content,
        task,
        this.isRunningRef,
        callback,
        this.abortController.signal,
      );

      message = `  - Relevant info: ${info
        .slice(0, 100)
        .replace(/\r?\n/g, '')} ...\n`;
      if (this.verbose) {
        console.log(message);
      }
      statusMessage += message;
      title = `${index}. Relevant info...`;
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      results += `${info}. `;
      index += 1;
      completedCount += 1;
    }

    if (!this.isRunningRef.current) return { output: '' };

    this.callbackSearchStatus(
      'Analyzing results...',
      `${statusMessage}Analyze results...`,
      task,
      this.messageCallback,
    );

    const ap = analystPrompt(results, task.task, this.language);
    const analyzedResults = await textCompletionTool(
      ap,
      this.modelName,
      this.abortController.signal,
      task.id,
      this.messageCallback,
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
    this.messageCallback(msg);

    return {
      output: analyzedResults,
      parameters: { query, symbol, quarterList },
    };
  }
  async searchTranscriptsApi(
    query: string,
    symbol?: string,
    quarterList?: number[],
    signal?: AbortSignal,
  ): Promise<SimilarDoc[] | null> {
    const response = await axios
      .post(
        '/api/tools/transcriptsearch',
        {
          query,
          symbol,
          quarterList,
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
  }
  callbackSearchStatus(
    title: string | undefined,
    message: string,
    task: AgentTask,
    messageCallback: (message: Message) => void,
  ) {
    messageCallback({
      type: 'search-logs',
      title: title ?? translate('SEARCH_LOGS', 'message'),
      text: '```markdown\n' + message + '\n```',
      id: task.id,
      icon: '🌐',
      open: false,
    });
  }
}
