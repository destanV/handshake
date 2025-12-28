import express, { Request, Response, NextFunction } from "express";
import { PinataService } from "../services/PinataService.js";
import { HttpStatusCode } from "axios";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get('/signed-url', authMiddleware,  async (req: Request, res: Response) => {
    try {
        const fileName = req.query.fileName as string;
        if (!fileName) {
            return res.status(400).send({
                "StatusCode": HttpStatusCode.BadRequest,
                "Detail": "file name can not be null"
            })
        }

        const client = new PinataService();
        const url = await client.createSignedUrl(30 * 60 , fileName);

        return res.status(201).json({signedUrl: url});
        
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: "Server side error while getting pianta signed url." });
    }
});

export default router;