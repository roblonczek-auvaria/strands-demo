# Romanian Legal RAG Agent

A Retrieval-Augmented Generation (RAG) agent for Romanian legal documents built with Strands Agents, AWS Bedrock and S3 vectors.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- AWS credentials configured (IAM user with Bedrock and S3 access)
- `uv` package manager ([install here](https://docs.astral.sh/uv/getting-started/installation/))

### 1. Setup AWS Credentials
Configure your AWS credentials using one of these methods:
```bash
# Option 1: AWS CLI
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=eu-central-1
```

### 2. Start the Backend
```bash
# Navigate to the strands-RAG directory
cd strands-RAG

    # Initialize uv project (if not already done)
    uv init --no-readme

# Install Python dependencies
uv add fastapi uvicorn pydantic strands-agents boto3

# Start the RAG agent server
uv run server.py
```

The server starts on `http://localhost:8080` 

Make sure to have valid AWS credentials exported in this terminal sesseion for the account!

### 3. Start the Frontend 

Make sure to run this in another terminal session.

```bash
# Navigate to the webapp directory
cd strands-RAG/chat-webapp

# Install Node.js dependencies
npm install

# Start the React development server  
npm run dev
```

The chat UI will be available at `http://localhost:5173`


## API Endpoints

- `POST /invocations` - Main chat endpoint
- `GET /ping` - Health check
- `POST /reset` - Reset agent conversation
- `GET /` - Service info

## Usage Options

### Option 1: Chat UI (Recommended)
Open `http://localhost:5173` and ask questions like:
- "În ce condiții poate ANCOM modifica o licența?"
- "Care sunt cerințele pentru tratate internaționale?"

### Option 2: Direct API
```python
import requests

response = requests.post(
    "http://localhost:8080/invocations",
    json={"prompt": "În ce condiții poate ANCOM modifica o licență?"}
)
print(response.json())
```