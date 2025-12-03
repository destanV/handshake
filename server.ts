import express from 'express';
import multer from "multer";
import { 
    processBuffer, 
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
const PORT: number = 4065;

const app = express();
const upload = multer({storage: multer.memoryStorage()});
app.use(express.json()); 

app.post('/upload', upload.single("file") , async (req: express.Request, res: express.Response) => {
    console.log(`\n---recieved upload req on /upload`);
    try {
        if(!req.file){
            return res.status(400).json({
                status:"erro",
                message:"no file uploaded",
            })
        }
        // get pinata sdk
        const SDK = getPinataClient();
        if(!SDK){
            console.log("pinata sdk creation Error");
            return res.status(500).json({ status: 'error', message: 'Failed to create Pinata SDK client.' });
        } 
        const fileData = await processBuffer(req.file.buffer, req.file.originalname);
        console.log(`server response: processed uploaded file:${fileData.name}`);
        // upload
        const result: UploadResponse = await uploadToPinata(SDK, fileData);
        
        // respond using cid
        console.log(`server response: upload successful, cid: ${result.cid}`);
        
        return res.status(200).json({
            status: 'success',
            message: `${fileData.name}' processed and pinned`,
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