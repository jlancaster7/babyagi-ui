import { getUserApiKey } from '@/utils/settings';
import axios from 'axios';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';


const getExamples = async (jsonFiles: string[]) => {
  let loadedObjectives: any[] = [];

  for (const jsonFile of jsonFiles) {
    const response = await fetch(`/api/json-provider?file=${jsonFile}`);
    const data = await response.json();
    loadedObjectives.push(data);
  }

  return loadedObjectives;
}
const objectiveJsonFiles = [
  './data/example_objectives/example_deer',
  // 'example1',
  // 'example2',
  './data/example_objectives/example3',
  './data/example_objectives/example4',
  // 'example5',
  // 'example6',
  './data/example_objectives/example7',
  './data/example_objectives/example8',
  './data/example_objectives/example9',
  './data/example_objectives/example10',

  //'example_code',
];
const filingSearchJsonFiles = [
	'./data/example_filings_search_query/example1',
	'./data/example_filings_search_query/example2'
];
const transcriptSearchJsonFiles: string[] = [
	'./data/example_transcript_search_query/example1',
	'./data/example_transcript_search_query/example2',
  './data/example_transcript_search_query/example3',
  './data/example_transcript_search_query/example4'
];

async function getEmbedding(
  text: string,
  modelName: string = 'text-embedding-ada-002',
) {
  const openAIApiKey = getUserApiKey();
  if (!openAIApiKey && process.env.NEXT_PUBLIC_USE_USER_API_KEY === 'true') {
    throw new Error('User API key is not set.');
  }

  if (openAIApiKey) {
    const embedding = new OpenAIEmbeddings({
      modelName,
      openAIApiKey: getUserApiKey(),
    });
    return await embedding.embedQuery(text);
  } else {
    const response = await axios.post(
      '/api/elf/embedding',
      {
        text: text,
        model_name: modelName,
      },
      {
        signal: new AbortController().signal,
      },
    );
    return response.data.response;
  }
}

function calculateSimilarity(embedding1: number[], embedding2: number[]) {
  const dotProduct = embedding1.reduce(
    (sum, a, i) => sum + a * embedding2[i],
    0,
  );
  const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));
  return dotProduct / (magnitude1 * magnitude2);
}

export async function findMostRelevantExamplesByType(
  userInput: string,
  type: string,
) {
  const userInputEmbedding = await getEmbedding(
    userInput,
    'text-embedding-ada-002',
  );

  let examples: any[] = [];

  if (type === 'objective') {
    examples = await getExamples(objectiveJsonFiles);
  } else if (type === 'filingSearchQuery') {
    examples = await getExamples(filingSearchJsonFiles)
  } else if (type === 'transcriptSearchQuery') {
    examples = await getExamples(transcriptSearchJsonFiles)
  } else return;

  let maxSimilarity = -Infinity;
  let mostRelevantExample = undefined;

  for (const example of examples) {
    const objectiveEmbedding = await getEmbedding(type === 'filingSearchQuery' ? example.task : example.objective);
    const similarity = calculateSimilarity(
      objectiveEmbedding,
      userInputEmbedding,
    );

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostRelevantExample = example;
    }
  }
  // if most similar isn't greater than 0.80, then have the first example be the default. 
  if (maxSimilarity < 0.8) return examples[0];
  else return mostRelevantExample;
}
