import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import modelRouter from './routes/models.js';
import pinataAuth from './routes/pinataAuth.js'
import dotenv from 'dotenv'

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
app.use('/pinata-auth', pinataAuth);

const startServer = async () => {

    const PORT = 5001;
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on port: ${PORT}`);
    });
}

await startServer();