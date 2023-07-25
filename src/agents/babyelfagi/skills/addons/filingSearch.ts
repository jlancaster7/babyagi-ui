import Airtable from 'airtable';
import { Skill, SkillType } from '../skill';
import { AgentTask, ExecuteSkillOutput } from '@/types';
import { searchFilings } from '@/agents/babydeeragi/tools/searchFilings';
import axios from 'axios';

export class FiilingSearch extends Skill {
  name = 'filing_search';
  descriptionForHuman =
    'Searches available public company SEC Filings.';
  descriptionForModel =
    'Semantic search of public company SEC Filings.';
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

    const taskOutput = await searchFilings(
      objective,
      task,
      dependentTaskOutputs,
      this.messageCallback,
	  'gpt-3.5-turbo',
	  this.verbose, 
	  this.language,
	  this.isRunningRef,
      this.abortController.signal,
    );
	return { output: taskOutput?.output ?? '', parameters: taskOutput?.parameters };
  }
}
