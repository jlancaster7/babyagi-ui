import { AgentTask, ExecuteSkillOutput } from '@/types';
import { Skill } from '../skill';

export class TextCompletion extends Skill {
  name = 'text_completion';
  descriptionForHuman =
    "A tool that uses OpenAI's text completion API to generate, summarize, and/or analyze text.";
  descriptionForModel =
    "A tool that uses OpenAI's text completion API to generate, summarize, and/or analyze text.";
  icon = '🤖';
  apiKeysRequired = ['openai'];

  async execute(
    task: AgentTask,
    dependentTaskOutputs: string,
    objective: string,
  ): Promise<ExecuteSkillOutput> {
    if (!this.valid) return { output: '' };

    const prompt = `Complete your assigned task based on the objective and only based on information provided in the dependent task output, if provided. \n###
    Output must be answered in ${this.language}.
    TASK=${task}
    OBJECTIVE=${objective}
    DEPENDENT TASK OUTPUT=${dependentTaskOutputs}
    RESPONSE=
    `;
    const output = await this.generateText(prompt, task, {
      temperature: 0.2,
      maxTokens: 800,
      modelName: 'gpt-3.5-turbo-16k',
    }); 
    return { output }
  }
}
