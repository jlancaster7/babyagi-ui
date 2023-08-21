export const searchQueryPrompt = (task: string, dependent_task: string) => {
  return `You are an AI assistant tasked with generating a Google search query based on the following task: ${task}. 
  ${
    dependent_task.length > 0
      ? `Consider the results of dependent tasks: ${dependent_task}.`
      : ''
  }
  If the task looks like a search query, return the identical search query as your response.
  Search Query:`;
};

export const analystPrompt = (results: string, task: string, language: string) => {
  return `You are an expert analyst. Rewrite the following information as one report so that only facts directly relevant to the following Task remain.
  You don't need to mention documents that didn't contain information. Only report on the information that was found.
  Report must be answered in ${language}.
  TASK=${task}
  INFORMATION=${results}.
  REPORT:`;
};

export const textCompletionToolPrompt = (
  objective: string,
  language: string,
  task: string,
  dependentTaskOutput: string,
) => {
  let prompt = `Complete your assigned task based on the objective and only based on information provided in the dependent task output, if provided.
   Your objective: ${objective}. Your task: ${task}
   Output must be answered in ${language}.\n
   `;
  if (dependentTaskOutput !== '') {
    prompt += `Your dependent tasks: ${dependentTaskOutput}\n OUTPUT:`;
  } else {
    prompt += '\nOUTPUT:';
  }
  return prompt;
};
