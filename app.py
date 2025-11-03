from flask import Flask, request, jsonify, render_template
import pickle
import numpy as np

app = Flask(__name__)

# Load all models
models = {
    "Linear Regression": pickle.load(open("LinearRegression.pkl", "rb")),
    # "Neural Network": pickle.load(open("nn.pkl", "rb")),
    "Random Forest": pickle.load(open("RandomForest.pkl", "rb")),
    "Support Vector Regressor": pickle.load(open("SVR.pkl", "rb")),
    "XGBoost": pickle.load(open("XGboost.pkl", "rb")),
}

"""Static model accuracies supplied by user.
Values are ratios in [0,1] and will be formatted as percentages in the UI.
"""
MODEL_ACCURACIES = {
    "Linear Regression": 0.8661,
    "Random Forest": 0.9959,
    "XGBoost": 0.9951,
    "Support Vector Regressor": 0.9930,
}

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    data = request.json
    fert = float(data["Fertilizer"]) 
    temp = float(data["Temp"]) 
    N = float(data["N"]) 
    P = float(data["P"]) 
    # K may be omitted by the UI; default to 0 when missing or empty
    K_raw = data.get("K", 0)
    K = float(K_raw) if str(K_raw).strip() != "" else 0.0

    X_input = np.array([[fert, temp, N, P, K]])

    results = {}
    for name, model in models.items():
        try:
            pred = model.predict(X_input)[0]
            # Use provided static accuracies
            acc = MODEL_ACCURACIES.get(name)
            # Normalize accuracy: if looks like a percentage (>1 and <=100), keep; if [0,1], keep as ratio for client formatting
            results[name] = {
                "prediction": round(float(pred), 2),
                "accuracy": acc,
            }
        except Exception as e:
            results[name] = { "error": str(e) }

    return jsonify(results)

if __name__ == "__main__":
    app.run(debug=True)
