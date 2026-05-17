const API_URL = "";

const state = {
    view: localStorage.getItem("currentView") || "dashboard",
    incomePeriod: localStorage.getItem("incomePeriod") || "month",
    dashboardMonth: localStorage.getItem("dashboardMonth") || "",
    selectedRepairId: localStorage.getItem("selectedRepairId") || "",
    user: JSON.parse(localStorage.getItem("user") || "null"),
    token: localStorage.getItem("token"),
    data: {}
};

const incomePeriodLabels = {
    week: "Седмица",
    month: "Месец",
    three_months: "3 месеца",
    year: "Година"
};

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
const VIN_ERROR_MESSAGE = "VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q.";

const app = document.getElementById("app");
const modalRoot = document.createElement("div");
modalRoot.id = "modal-root";
document.body.appendChild(modalRoot);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function money(value) {
    return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("bg-BG");
}

function formatInputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("bg-BG");
}

function dateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function monthKey(value) {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

function monthDateFromKey(value) {
    const key = value || monthKey();
    const [year, month] = key.split("-").map(Number);

    return new Date(year, month - 1, 1);
}

async function api(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers
    });

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error("Server returned an invalid response. Restart the backend and try again.");
        }
    }

    if (!response.ok) {
        const message = data?.error || data?.message || "Request failed";

        if (state.token && (response.status === 401 || response.status === 403) && message.toLowerCase().includes("token")) {
            logout();
            throw new Error("Session expired. Please log in again.");
        }

        throw new Error(message);
    }

    return data;
}

function normalizeFormValues(values) {
    Object.keys(values).forEach((key) => {
        if (key === "vin" && typeof values[key] === "string") {
            values[key] = values[key].trim().toUpperCase();
        }

        if (typeof values[key] === "string" && values[key].includes("T") && key.includes("date")) {
            values[key] = values[key].replace("T", " ");
        }
    });

    return values;
}

function validateFormValues(values) {
    if (values.vin && !VIN_PATTERN.test(values.vin)) {
        throw new Error(VIN_ERROR_MESSAGE);
    }
}

function bindVinInputs(scope = document) {
    scope.querySelectorAll("[data-vin-input]").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = input.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .replace(/[IOQ]/g, "")
                .slice(0, 17);
        });
    });
}

function setNotice(message, isError = false) {
    const box = document.querySelector("[data-notice]");
    if (!box) return;

    box.className = `notice${isError ? " error" : ""}`;
    box.textContent = message;
    box.hidden = false;
}
