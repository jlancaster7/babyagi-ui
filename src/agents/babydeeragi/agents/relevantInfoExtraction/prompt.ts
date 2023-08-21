import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from 'langchain/prompts';

export const relevantInfoExtractionPrompt = () => {
  const systemTemplate = `You are an AI assistant that helps people extract information out of documents.`;
  const relevantInfoExtractionTemplate = `Your current task is {task}. 
  Analyze the following text and return information directly related to your current task. 
  Only return information directly related to your current task.
  
  Text to analyze: {chunk} 
  New Information:
  `;
  const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(systemTemplate),
    HumanMessagePromptTemplate.fromTemplate(relevantInfoExtractionTemplate),
  ]);

  prompt.inputVariables = [ 'task', 'notes', 'chunk'];

  return prompt;
};
