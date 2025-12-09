//backend data
interface IModel {
    _id:            string;
    name:           string;
    type:           string;
    modelFileCid:   string;
    metadataCid:    string;
    modelHash:      string;
    ownerAddress:   string;
    createdAt:      string;
    updatedAt:      string;
}

async function getModels(): Promise<IModel[]> {
    const res = await fetch('http://localhost:3000/models', { cache: 'no-store' });

    if (!res.ok) {
        throw new Error('Error while fetching the models');
    }

    return res.json();
}

export default async function ModelsPage() {
    const models = await getModels();

    return (
        <div className="min-h-screen bg-gray-50 p-10 font-sans">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                    Model Hub
                    <span className="ml-4 text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        Registered Models: {models.length}
                    </span>
                </h1>
                {models.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
                        No models in the system.
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {models.map((model) => (
                            <div
                                key={model._id}
                                className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-semibold text-blue-600 hover:underline cursor-pointer">
                                            <a href={`http://localhost:3000/models/${model._id}`} target="_blank">
                                                {model.name}
                                            </a>
                                            <span className="inline-block mt-2 bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                                                {model.type}
                                            </span>
                                        </h2>
                                    </div>
                                    <div className="text-right text-s text-gray-400">
                                        CreatedAt : 
                                        {new Date(model.createdAt).toISOString()}
                                    </div>
                                    <div className="text-right text-s text-gray-400">
                                        UpdatedAt : 
                                        {new Date(model.updatedAt).toISOString()}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 font-mono space-y-1">
                                    <p className="truncate">
                                        <span className="font-bold text-gray-800">Hash:</span> {model.modelHash}
                                    </p>
                                    <p className="truncate">
                                        <span className="font-bold text-gray-800">Owner:</span> {model.ownerAddress}
                                    </p>
                                    <a className="truncate" href="ipfs://">
                                        <span className="font-bold text-gray-800">ModelFileCid:</span> {model.modelFileCid}
                                    </a>
                                    <p className="truncate">
                                        <span className="font-bold text-gray-800">MetadataCid:</span> {model.metadataCid}
                                    </p>  
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}