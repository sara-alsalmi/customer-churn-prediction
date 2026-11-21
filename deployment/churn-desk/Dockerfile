FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
COPY weights/AE1_Learned_Features ./weights/AE1_Learned_Features
COPY data/bank_clean.csv ./data/bank_clean.csv
COPY deployment ./deployment
ENV PORT=7860 TF_CPP_MIN_LOG_LEVEL=2 TF_NUM_INTEROP_THREADS=2 TF_NUM_INTRAOP_THREADS=2
EXPOSE 7860
CMD ["sh", "-c", "uvicorn deployment.churn-desk.app.main:app --host 0.0.0.0 --port ${PORT}"]
