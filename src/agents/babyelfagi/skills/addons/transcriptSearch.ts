import Airtable from 'airtable';
import { Skill, SkillType } from '../skill';
import { AgentTask, ExecuteSkillOutput } from '@/types';
import { searchTranscripts } from '@/agents/babydeeragi/tools/searchTranscripts';
import axios from 'axios';

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

    const taskOutput = await searchTranscripts(
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
	return {output: taskOutput?.output ?? '', parameters: taskOutput?.parameters};
  }
}
