import Airtable from 'airtable';
import { Skill, SkillType } from '../skill';
import { AgentTask, ExecuteSkillOutput, Message, SimilarDoc } from '@/types';
import axios from 'axios';
import { translate } from '@/utils/translate';
import { textCompletionTool } from '@/agents/common/tools/textCompletionTool';
import { findMostRelevantExamplesByType } from '@/utils/objective';
import { largeTextExtract } from '@/agents/babydeeragi/tools/largeTextExtract';
import { analystPrompt } from '@/agents/babydeeragi/prompt';

export class FiilingSearch extends Skill {
  name = 'filing_search';
  descriptionForHuman = 'Searches available public company SEC Filings.';
  descriptionForModel = 'Semantic search of public company SEC Filings.';
  icon = '🗄';
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
      'filingSearchQuery',
    );
    const exampleTask = relevantQueryExample.task;
    const exampleDependentTaskOutput =
      relevantQueryExample.dependent_task_output;
    const exampleObjective = relevantQueryExample.objective;
    const exampleSearchQuery = relevantQueryExample.search_query;

    const queryPrompt = `Generate a search query to be used in a semantic search of excerpts from public company SEC Filings based on the task and dependent tasks outputs.
      Only return the search query. 
      ${
        relevantQueryExample
          ? `EXAMPLE OBJECTIVE=${relevantQueryExample.objective}
      TASK=${relevantQueryExample.task}
      ${
        relevantQueryExample.dependent_task_output.length
          ? `DEPENDENT_TASKS_OUTPUTS=${relevantQueryExample.dependent_task_output}`
          : ''
      }
      SEARCH_QUERY=${relevantQueryExample.search_query}`
          : ''
      }
      OBJECTIVE=${objective}
      TASK=${task.task}
      ${dependentTaskOutputs.length ? `DEPENDENT_TASK_OUTPUT=${dependentTaskOutputs}` : ''}
      SEARCH_QUERY=
    `;

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

    const trimmedQuery = query.replace(/^"|"$/g, ''); // remove quotes from the search query

    let title = `🗄 Searching Filings`;
    let message = `Search query: ${trimmedQuery}\nSymbol: ${symbol}\nQuarter List: ${quarterList}\n`;
    if (this.verbose) {
      console.log(message);
    }
    let statusMessage = message;
    this.callbackSearchStatus(title, statusMessage, task, this.messageCallback);

    const searchResults = await this.searchFilingsApi(
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

      const url = searchResult.title;
      let title = `${index}. Reading: ${url} ...`;

      if (this.verbose) {
        console.log(message);
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
      title = `${index}. Filing excerpt...`;
      statusMessage += content + '\n';
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );
      statusMessage += message;
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
        .slice(0, 500)
        .replace(/\r?\n/g, '')} ...\n`;
      if (this.verbose) {
        console.log(info);
      }
      statusMessage += message;
      title = `${index}. Relevant info...`;
      this.callbackSearchStatus(
        title,
        statusMessage,
        task,
        this.messageCallback,
      );

      results += `Notes from Document ${index}:\n${info}.\n\n`;
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
    console.log('cummulative notes from filings', results);
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
  async searchFilingsApi(
    query: string,
    symbol: string,
    quarterList?: number[],
    signal?: AbortSignal,
  ): Promise<SimilarDoc[] | null> {
    const response = await axios
      .post(
        '/api/tools/filingsearch',
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
}
