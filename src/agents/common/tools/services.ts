import { PineconeClient } from '@pinecone-database/pinecone';
import pgPromise, { IDatabase, IMain } from 'pg-promise';
import format from 'pg-format';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { VectorOperationsApi } from '@pinecone-database/pinecone/dist/pinecone-generated-ts-fetch';
import {
  FilingTablesProcessedRecordWithDetailTable,
  FilingWithDetailTable,
  TranscriptTableWithDetail,
} from '@/types';

export class Repository {
  constructor(
    private db: IDatabase<any>,
    private pgp: IMain,
    private s3Client: S3Client,
    private pineconeIndex: VectorOperationsApi,
  ) {}
  queryPinecone = async (
    vector: number[],
    namespace: string,
    topK: number,
    filter?: any,
    includeMetadata?: boolean,
    includeValues?: boolean,
  ) => {
    return await this.pineconeIndex.query({
      queryRequest: {
        vector,
        topK,
        namespace,
        filter,
        includeMetadata,
        includeValues,
      },
    });
  };
  getS3Doc = async (bucketName: string, s3Key: string) => {
    const streamToString = (stream: any) =>
      new Promise<string>((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk: any) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
    const data = (async () =>
      JSON.parse(
        await streamToString(
          (
            await this.s3Client.send(
              new GetObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
              }),
            )
          ).Body,
        ),
      ))();
    return data;
  };
  getProcessedTranscriptWithDetailById = async (ids: number[]) => {
    if (!ids.length) return [];
    let query = `
        SELECT pt.id,
               pt.transcript_id          AS "transcriptId",
               t.participant_description AS "participantDescription",
               t.participant_name        AS "participantName",
               t.participant_role        AS "participantRole",
               t.session                 AS "session",
               pt.prompt_position        AS "speechPosition",
               pt.s3_location            AS "s3Location",
               tl.symbol,
               tl.title,
               tl.quarter,
               tl.year,
               fcm.calendar_quarter      AS "calendarQuarter",
               fcm.calendar_year         AS "calendarYear",
               tl.time,
               tl.audio,
               pt.created_at             AS "createdAt",
               pt.updated_at             AS "updatedAt",
               t.x_path                  as "xPath",
               tl.s3_html_url            as "s3HtmlUrl"
        FROM processed_transcript pt
                 INNER JOIN transcript_list tl ON pt.transcript_id = tl.transcript_id
                 INNER JOIN transcript t ON pt.transcript_id = t.transcript_id
            AND t.speech_position = (split_part(pt.prompt_position, '-', 1)::int)
                 LEFT JOIN fiscal_calendar_map fcm
                           ON tl.symbol = fcm.symbol AND tl.quarter = fcm.fiscal_quarter AND tl.year = fcm.fiscal_year
        WHERE pt.id in (%L) AND tl.title != 'NVDA - Earnings call Q1 2007'
    `;

    return this.db.query<TranscriptTableWithDetail[]>(format(query, ids));
  };
  getProcessedFilingWithDetailById = async (ids: number[]) => {
    if (!ids.length) return [];
    let query = `SELECT fpp.id,
                        fpp.filing_list_id as "filingListId",
                        fpp.index,
                        fpp.s3_location    as "s3Location",
                        fpp.part,
                        fpp.last_header    as "lastHeader",
                        fpp.x_paths        as "xPaths",
                        fl.symbol,
                        fl.filing_type     as "filingType",
                        fl.quarter         as "calendarQuarter",
                        fl.year            as "calendarYear",
                        fcm.fiscal_quarter as "fiscalQuarter",
                        fcm.fiscal_year    as "fiscalYear",
                        fl.report_date     as "reportDate",
                        fl.filing_date     as "filingDate",
                        fl.html_s3_url     as "htmlS3Url",
                        fpp.created_at     as "createdAt",
                        fpp.updated_at     as "updatedAt",
						fpp.part_description as "partDescription",
						fpp.item,
						fpp.item_description as "itemDescription"
                 FROM filing_prose_processed fpp
                          INNER JOIN filing_list fl
                                     ON fpp.filing_list_id = fl.id
                          INNER JOIN filing_prose fp
                                     ON fpp.filing_list_id = fp.filing_list_id
                                         AND fpp.index = fp.index
                          LEFT JOIN fiscal_calendar_map fcm
                                    ON fl.symbol = fcm.symbol AND fl.quarter = fcm.calendar_quarter AND
                                       fl.year = fcm.calendar_year and fcm.fiscal_quarter between 1 and 4
                 WHERE fpp.id in (%L)`;

    return this.db.query<FilingWithDetailTable[]>(format(query, ids));
  };
  getFilingTablesProcessedWithDetailsById = async (ids: number[]) => {
    const query = `
		SELECT ftp.id,
                ftp.filing_list_id as "filingListId",
                ftp.index,
                ftp.s3_location    as "s3Location",
                ftp.part,
                ftp.item,
                ftp.part_description as "partDescription",
                ftp.item_description as "itemDescription",
                ftp.last_header    as "lastHeader",
                ftp.x_path        as "xPath",
                fl.symbol,
                fl.filing_type     as "filingType",
                fl.quarter         as "calendarQuarter",
                fl.year            as "calendarYear",
                fcm.fiscal_quarter as "fiscalQuarter",
                fcm.fiscal_year    as "fiscalYear",
                fl.report_date     as "reportDate",
                fl.filing_date     as "filingDate",
                fl.html_s3_url     as "htmlS3Url",
                ftp.created_at     as "createdAt",
                ftp.updated_at     as "updatedAt"
        FROM filing_table_processed ftp
                INNER JOIN filing_list fl
                            ON ftp.filing_list_id = fl.id
                INNER JOIN filing_table ft
                            ON ftp.filing_list_id = ft.filing_list_id
                                AND ftp.index = ft.index
                LEFT JOIN fiscal_calendar_map fcm
                            ON fl.symbol = fcm.symbol AND fl.quarter = fcm.calendar_quarter AND
                            fl.year = fcm.calendar_year and fcm.fiscal_quarter between 1 and 4
        WHERE ftp.id in (%L)
    `;
    return this.db.query<FilingTablesProcessedRecordWithDetailTable[]>(
      format(query, ids),
    );
  };
}

export const getRepository = async () => {
  let pgp = pgPromise({});
  let pgClient = pgp({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
  });
  const pinecone = new PineconeClient();
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT) {
    throw new Error('Pinecone API key or environment not set');
  }
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });
  if (!process.env.PINECONE_INDEX_NAME) return null;
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  const s3client = new S3Client({
    region: 'us-east-1',
  });
  return new Repository(pgClient, pgp, s3client, pineconeIndex);
};
