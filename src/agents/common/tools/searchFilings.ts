import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { getRepository, Repository } from "./services"
import { FilingTablesProcessedRecordWithDetailTable, FilingWithDetailTable, SimilarDoc } from "@/types";

const getAndFormatFiling = async (
    repo: Repository, 
    match: any, 
    filing: FilingWithDetailTable
    ) => {
    const filingText = await repo.getS3Doc(
        "tp-company-documents",
        filing.s3Location
    );
    return {
        id: filing.id,
        section: "",
        sectionPosition: filing.index,
        text: filingText[0],
        score: match.score || 0,
        fiscalQuarter: filing.fiscalQuarter,
        fiscalYear: filing.fiscalYear,
        calendarQuarter: filing.calendarQuarter,
        calendarYear: filing.calendarYear,
        docLink: filing.htmlS3Url ? filing.htmlS3Url : "",
        title: `${filing.symbol} ${
            filing.filingType === "10-K"
                ? ""
                : `Q${filing.fiscalQuarter ? filing.fiscalQuarter : filing.calendarQuarter}`
        } ${filing.fiscalYear ? filing.fiscalYear : filing.calendarYear} ${filing.filingType}`,
        subTitle: `${filing.part ? `${filing.part}` : ""} ${
            filing.item ? `- ${filing.item}` : ""
        } ${filing.lastHeader ? `- ${filing.lastHeader}` : ""}`,
        symbol: filing.symbol,
        type: "filings",
        xPath: filing.xPaths,
        eventDate: filing.filingDate,
        asOfDate: filing.reportDate,
    } as SimilarDoc;
};
const getAndFormatFilingTable = async (
    repo: Repository, 
    match: any,
    filingTable: FilingTablesProcessedRecordWithDetailTable
) => {
    const filingTableObject = await repo.getS3Doc(
        "tp-company-documents",
        filingTable.s3Location
    );
    if (!filingTableObject.decomposedNode) return {} as SimilarDoc;
    const filingTableText =
        filingTableObject.precedingText +
        "\n" +
        filingTableObject.decomposedNode.map((a: string[]) => a.join(" ")).join("\n") +
        "\n" +
        filingTableObject.succeedingText;
    return {
        id: filingTable.id,
        section: "",
        sectionPosition: filingTable.index,
        text: filingTableText,
        score: match.score || 0,
        fiscalQuarter: filingTable.fiscalQuarter,
        fiscalYear: filingTable.fiscalYear,
        calendarQuarter: filingTable.calendarQuarter,
        calendarYear: filingTable.calendarYear,
        docLink: filingTable.htmlS3Url ? filingTable.htmlS3Url : "",
        title: `${filingTable.symbol} ${
            filingTable.filingType === "10-K"
                ? ""
                : `Q${filingTable.fiscalQuarter ? filingTable.fiscalQuarter : filingTable.calendarQuarter}`
        } ${filingTable.fiscalYear ? filingTable.fiscalYear : filingTable.calendarYear} ${filingTable.filingType}`,
        subTitle: `${filingTable.part} - ${filingTable.itemDescription} - ${filingTable.lastHeader}`,
        symbol: filingTable.symbol,
        type: "filings_table",
        xPath: filingTable.xPath,
        eventDate: filingTable.filingDate,
        asOfDate: filingTable.reportDate,
    } as SimilarDoc;
};

const searchFilingsProse = async (repo: Repository, queryEmbedding: number[], filter: any) => {
    const matches = (await repo.queryPinecone(
        queryEmbedding, 
        'filings', 
        10, 
        filter,
        true
        )).matches;
    
    if (!matches?.length) return [];

    const filings = await repo.getProcessedFilingWithDetailById(
        matches.map(a => Number(a.id.split('_')[1]))
        )
    


	let formattedFilings: Promise<SimilarDoc>[] = [];
    matches.forEach((match, index) => {
        const filing = filings.find(
            (a) => Number(a.id) === Number(String(match.id).split('_')[1])
            );
        if (filing?.s3Location) {
            formattedFilings.push(
                getAndFormatFiling(repo, match, filing)
                );
        }
    });

    return (await Promise.all(formattedFilings)).sort((a, b) => b.score - a.score);
}
const searchFilingsTable = async (repo: Repository, queryEmbedding: number[], filter: any) => {
    const matches = (await repo.queryPinecone(
        queryEmbedding, 
        'filings_tables', 
        10, 
        filter,
        true
        )).matches;
    console.log('# of filings tables returned', matches?.length)
    if (!matches?.length) return [];

    const filings = await repo.getFilingTablesProcessedWithDetailsById(
        matches.map(a => Number(a.id.split('_')[2]))
        )
    

	let formattedFilings: Promise<SimilarDoc>[] = [];
    matches.forEach((match, index) => {
        const filing = filings.find(
            (a) => Number(a.id) === Number(String(match.id).split('_')[1])
            );
        if (filing?.s3Location) {
            formattedFilings.push(
                getAndFormatFilingTable(repo, match, filing)
                );
        }
    });
    return (await Promise.all(formattedFilings)).sort((a, b) => b.score - a.score);
}
export const searchFilingsTool = async (query: string, symbol?: string, quarterList?: number[]) => {
    const repo = await getRepository();

    if (!repo) return null;
    
    const embedding = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
    const queryEmbedding = (await embedding.embedDocuments([query]))[0] ?? [];
    
    
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
    const prose = await searchFilingsProse(repo, queryEmbedding, filter)
    const table = await searchFilingsTable(repo, queryEmbedding, filter)
    return [...prose, ...table].sort((a, b) => b.score - a.score)
}

