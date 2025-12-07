import express, { Request, Response, NextFunction } from "express";
import multer, {Multer} from "multer";
import crypto from "crypto";
import fs from "fs";
import { Model } from '../models/model.js';
import { PinataService } from '../services/PinataService.js';
import {calculateFileHash} from "../utilities/utilities.js";

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
//in memory-db
const models: Model[] = [
    new Model({ id: 1, name: "GPT", type: "LLM", modelFileCid: null, modelHash: ""}),
    new Model({ id: 2, name: "BERT", type: "LLM", modelFileCid: null, modelHash: "" })
];

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
router.get('/', (req: Request, res: Response) => {
    res.send(models);
});

//GET by ID
router.get('/:id', (req:Request<RouteParams>, res:Response) => {
    const id = parseInt(req.params.id);
    const model = models.find(m => m.id === id);

    if(model)
        return res.send(model)
    else
        return res.status(404).send(
            {
                "StatusCode": "404",
                "Message": `Model with ${id} could not be found.`
            }
        )
});

//POST (upload)
router.post('/', upload.single('model'), validateModel, async (req: Request, res: Response) => {
    if(!req.file)
        return res.status(400).send("File is missing");

    const filePath = req.file.path;

    try {
        const modelHash = await calculateFileHash(filePath)

        const existingModel = models.find(m => m.modelHash === modelHash);
        if (existingModel) {
            fs.unlinkSync(filePath) // sil

            console.log(`Duplicate model detected: ${existingModel.id}`);
            return res.status(409).send(
            {
                "StatusCode": "409",
                "Message": "The model is already registered on the system.",
                "Detail": `Model with the hash ${existingModel.modelHash} is already registered on the system. Id: ${existingModel.id}`
            });
        }

        const modelFileResponse = await pinata.uploadFile(filePath, req.file.mimetype, req.file.originalname);

        const newModel = new Model({
            id: models.length + 1,
            name: req.body.name,
            type: req.body.type,
            modelFileCid: modelFileResponse.cid,
            modelHash: modelHash
        });

        models.push(newModel);

        const modelJson = await pinata.uploadJson(newModel.getModelJson());

        fs.unlinkSync(filePath); //we're done with the model?

        const response = {
            ...newModel.getModelJson(),
            metadataCid: modelJson.cid
        };

        return res.status(201).json(response);

    } catch (e) {
        console.error(e);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send({ error: "Server side error." });
    }
});

export default router;