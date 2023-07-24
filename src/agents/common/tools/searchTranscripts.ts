import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { getRepository, Repository } from "./services"
import { SimilarDoc } from "@/types";

export const getAndFormatTranscript = async (
    repo: Repository, 
    match: any, 
    transcript: any
    ) => {
    const transcriptText = await repo.getS3Doc(
        "tp-company-documents",
        transcript.s3Location
    );
    return {
        id: transcript.id,
        section: transcript.session,
        sectionPosition: Number(transcript.speechPosition),
        text: transcriptText[0],
        score: match.score || 0,
        fiscalQuarter: transcript.quarter,
        fiscalYear: transcript.year,
        calendarQuarter: transcript.calendarQuarter,
        calendarYear: transcript.calendarYear,
        docLink: transcript.s3HtmlUrl ? transcript.s3HtmlUrl : "",
        title: transcript.title,
        subTitle: `${transcript.participantName} - ${transcript.participantDescription}`,
        symbol: transcript.symbol,
        type: "transcripts",
        xPath: transcript.xPath,
        eventDate: transcript.time,
    } as SimilarDoc;
};

export const searchTranscriptsTool = async (query: string, symbol?: string, quarterList?: number[]) => {
    const repo = await getRepository();

    const embedding = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
    const queryEmbedding = (await embedding.embedDocuments([query]))[0] ?? [];
    console.log(repo)
    if (!repo) return null;
    const filter = {
        $and: [] as any[]
    }
    if (symbol) filter.$and.push(
        {
            symbol: {
                $eq: symbol
            }
        }
    )
    if (quarterList?.length) {
        filter.$and.push({
            yearQuarter: {
                $in: quarterList
            }
        })
    }

    const matches = (await repo.queryPinecone(
        queryEmbedding, 
        'transcripts', 
        10, 
        filter,
        true
        )).matches;
    
    if (!matches?.length) return [];
    console.log(matches)
    console.log('# of matches',matches.length)
    const transcripts = await repo.getProcessedTranscriptWithDetailById(
        matches.map(a => Number(a.id.split('_')[1]))
        )
    
    console.log('# of transcripts', transcripts.length)

	let formattedTranscripts: Promise<SimilarDoc>[] = [];
    matches.forEach((match, index) => {
        const transcript = transcripts.find(
            (a) => Number(a.id) === Number(String(match.id).split('_')[1])
            );
        if (transcript?.s3Location) {
            formattedTranscripts.push(
                getAndFormatTranscript(repo, match, transcript)
                );
        }
    });
    console.log('# of transcripts', formattedTranscripts.length)
    return (await Promise.all(formattedTranscripts)).sort((a, b) => b.score - a.score);
}

