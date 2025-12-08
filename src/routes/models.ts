import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import { PinataService } from '../services/PinataService.js';
import {calculateFileHash} from "../utilities/utilities.js";
import Model, {IModelData} from "../models/model.js";

const router = express.Router();
const pinata = new PinataService();

//Multer config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // dosyalar buraya inecek
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now();
        cb(null, file.originalname + "-" + uniqueSuffix) //unique olmalı)
    }
});

const upload = multer({ storage: storage });
interface RouteParams {
    id: string;
}

const validateModel = (req:Request, res:Response, next: NextFunction) =>{
    if (!req.body.name || !req.body.type || !req.file)
        return res.status(400).send({ error: "Bad Request: required 'name', 'type', 'file' " });
    else
        next();
}
//GET all
router.get('/', async (req: Request, res: Response) => {
    try {
        const models = await Model.find();
        res.status(200).send(models)
    } catch(e) {
        console.error(e);
        res.status(500).send({ error: "Server side error while fetching models." });
    }
});

//GET by ID
router.get('/:id', async (req:Request<RouteParams>, res:Response) => {
    const id = parseInt(req.params.id);
    try {
        const model = await Model.findById(id);
        if(model)
            return res.send(model)
        else
            return res.status(404).send(
                {
                    "StatusCode": "404",
                    "Message": `Model with ${id} could not be found.`
                });
    } catch (e) {
        console.error(e);
        return res.status(400).send({
            error: "Invalid ID format or server error."
        });
    }
});

//POST (upload)
router.post('/', upload.single('model'), validateModel, async (req: Request, res: Response) => {
    if(!req.file)
        return res.status(400).send("File is missing");

    const filePath = req.file.path;

    try {
        const modelHash = await calculateFileHash(filePath)

        const existingModel = await Model.findOne({ modelHash });
        if (existingModel) {
            fs.unlinkSync(filePath) // sil

            console.log(`Duplicate model detected: ${existingModel._id}`);
            return res.status(409).send(
            {
                "StatusCode": "409",
                "Message": "The model is already registered on the system.",
                "Detail": `Model with the hash ${existingModel._id} is already registered on the system. Id: ${existingModel._id}`
            });
        }

        const modelFileResponse = await pinata.uploadFile(filePath, req.file.mimetype, req.file.originalname);

        const modelData: Partial<IModelData> = {
            name: req.body.name,
            type: req.body.type,
            ownerAddress: 'default_owner',
            modelFileCid: modelFileResponse.cid,
            metadataCid: 'TEMP_CID',
            modelHash: modelHash
        };

        const newModel = new Model(modelData);

        const modelJson = await pinata.uploadJson(newModel.toObject());

        newModel.metadataCid = modelJson.cid;

        await newModel.save();

        fs.unlinkSync(filePath); //we're done with the model?

        return res.status(201).json(newModel.toObject());

    } catch (e) {
        console.error(e);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send({ error: "Server side error." });
    }
});

export default router;