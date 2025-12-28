import express, { Request, Response } from "express";
import { PinataService } from '../services/PinataService.js';
import Model from "../data/Model.js";
import { Types } from "mongoose";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
const pinata = new PinataService()

//GET All DataModels
router.get('/', async (req: Request, res: Response) => {
    try {
        const models = await Model.find();

        res.status(200).send(models)
        
    } catch(e) {
        console.error(e);
        res.status(500).send({ error: "Server side error while fetching data." });
    }
});

//GET CheckModelByHash
router.get('/check/:hash', async (req: Request, res: Response) => {
    try {
        const { hash } = req.params;

        if (!hash) {
            return res.status(400).json({ error: "Hash required" });
        }

        const exists = await Model.exists({ modelHash: hash });

        return res.status(200).json({ exists: !!exists });

    } catch (e) {
        console.error('Check hash error:', e);
        return res.status(500).json({ error: "Check failed" });
    }
});

//GET by ID
interface GetModelRouteParams {
    id: string
}
router.get('/:id', async (req: Request<GetModelRouteParams>, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const model = await Model.findById(id).lean();
        if (!model) {
            return res.status(404).json({ message: "Model not found." });
        }

        return res.status(200).json(model);

    } catch (e) {
        console.error("GetById Error:", e);
        return res.status(500).json({ error: "Server error." });
    }
});

//POST Confirm model 
router.post('/confirm', authMiddleware,  async (req:Request, res:Response) => {
    try {
        const {
            name,
            type,
            modelFileCid,
            size,
            hash,
        } = req.body;

        if (!name || !modelFileCid || !hash) {
            return res.status(400).json({
                error: "Missing required fields (name, cid, hash)"
            });
        }

        const ownerAddress = req.wallet!;

        const duplicate = await Model.findOne({modelHash: hash});
        if (duplicate) {
            return res.status(409).json({
                error: "Model with this hash already exists.",
                existingModelId: duplicate._id
            });
        }

        const metadataPayload = {
            name,
            description: `Uploaded to Handshake by ${req.wallet}`,
            externalUrl: `https://ipfs.io/ipfs/${modelFileCid}`,
            attributes: [ // OpenSea format
                { trait_type: "Type", value: type || "AI Model" },
                { trait_type: "Size", value: size },
                { trait_type: "Hash", value: hash },
                { trait_type: "Date", value: new Date().toISOString() }
            ]
        };

        const metadataCid = await pinata.uploadMetadata(metadataPayload);

        const newModel = new Model({
            name,
            type: type, 
            ownerAddress,
            modelFileCid: modelFileCid,      
            metadataCid: metadataCid, 
            modelHash: hash,
            size: size,
            likes: 0
        });

        await newModel.save();

        console.log(`New Model Confirmed: ${name} (${newModel._id})`);

        return res.status(201).json(newModel);
    } catch (e) {
        console.error("Confirm error:", e);
        return res.status(500).json({ error: "Could not register model to the system." });
    }
})

export default router;