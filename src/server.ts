import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import modelRouter from './routes/models.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI!);
        console.log(`Connected to MongoDB: ${conn.connection.host}`);
    }catch (e) {
        console.log(`Could not connect to MongoDB`);
        console.error(e);
        process.exit();
    }
}

app.use(cors());
app.use(express.json());
app.use('/models', modelRouter);


const startServer = async () => {

    await connectDB();

    app.listen(3000, () => {
        console.log("Server running on port: 3000");
    });
}

await startServer();