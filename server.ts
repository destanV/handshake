import express from 'express';
import { 
    processLocalFile, 
    uploadToPinata, 
    getPinataClient
} from './upload.ts';
interface UploadResponse {
id: string;
	name: string;
	cid: string;
	size: number;
	created_at: string;
	number_of_files: number;
	mime_type: string;
	group_id: string | null;
	keyvalues: {
		[key: string]: string;
	};
	vectorized: boolean;
	network: string;
};
//dummy
const TARGET_FILE_PATH: string = "Data/model.txt";
const PORT: number = 4065;

const app = express();

// BELKİ MIDDLEWARE OLARAK PROCESSLOCALFILE KULLANMAK ÜZERE REFACTOR
app.use(express.json()); 

app.post('/upload', async (req: express.Request, res: express.Response) => {
    console.log(`\n--- recieved upload req on /upload`);
    try {
        // get pinata sdk
        const SDK = getPinataClient();
        if(!SDK){
            console.log("pinata sdk creation Error");
            return;
        } 
        // process local file
        const fileData = await processLocalFile(TARGET_FILE_PATH);
        console.log(`server response: process local file successful: ${TARGET_FILE_PATH}`);

        // upload
        const result: UploadResponse = await uploadToPinata(SDK, fileData);
        
        // respond using cid
        console.log(`server response: upload successful, cid: ${result.cid}`);
        
        return res.status(200).json({
            status: 'success',
            message: `${TARGET_FILE_PATH}' processed and pinned`,
            cid: result.cid,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "error occured";
        console.error('error message: ', errorMessage);
        return res.status(500).json({
            status: 'error',
            message: 'internal server error',
            details: errorMessage,
        });
    }
});


app.listen(PORT, () => {
    console.log(`server running on ${PORT}`);
    console.log(`endpoint: POST http://localhost:${PORT}/upload`);
});