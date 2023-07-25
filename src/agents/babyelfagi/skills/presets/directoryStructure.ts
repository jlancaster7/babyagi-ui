import { AgentTask, ExecuteSkillOutput } from '@/types';
import { Skill, SkillType } from '../skill';

export class DirectoryStructure extends Skill {
  name = 'directory_structure';
  descriptionForHuman =
    "A skill that outputs the directory structure of the 'src' folder.";
  descriptionForModel =
    "A skill that outputs the directory structure of the 'src' folder.";
  icon = '📂';
  type: SkillType = 'dev';

  async execute(
    task: AgentTask,
    dependentTaskOutputs: string,
    objective: string,
  ): Promise<ExecuteSkillOutput> {
    const response = await fetch('/api/local/directory-structure', {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error('Failed to get directory structure');
    }
    const output = await response.json()
    return { output };
  }
}
