const API_URL = "";

const state = {
    view: sessionStorage.getItem("currentView") || "dashboard",
    incomePeriod: localStorage.getItem("incomePeriod") || "month",
    dashboardMonth: localStorage.getItem("dashboardMonth") || "",
    selectedRepairId: sessionStorage.getItem("selectedRepairId") || "",
    user: JSON.parse(sessionStorage.getItem("user") || "null"),
    token: sessionStorage.getItem("token"),
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

function shortText(value, maxLength = 28) {
    const text = String(value ?? "").trim();
    if (!text) return "-";

    if (text.length <= maxLength) {
        return escapeHtml(text);
    }

    const shortened = text.slice(0, maxLength).trimEnd() + "...";
    return "<span class=\"truncate-text\" title=\"" + escapeHtml(text) + "\">" + escapeHtml(shortened) + "</span>";
}

function twoLineName(value, firstMaxLength = 12, lastMaxLength = 12) {
    const text = String(value ?? "").trim();
    if (!text) return "-";

    const parts = text.split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ");
    const title = escapeHtml(text);
    const first = shortText(firstName, firstMaxLength);
    const last = lastName ? shortText(lastName, lastMaxLength) : "";

    return `<span class="two-line-name" title="${title}"><span>${first}</span>${last ? `<span>${last}</span>` : ""}</span>`;
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

function formDraftKey(form) {
    return `formDraft:${state.user?.id || "guest"}:${form.dataset.draftKey}`;
}

function formDraftValues(form) {
    const values = {};
    form.querySelectorAll("input[name], select[name], textarea[name]").forEach((field) => {
        if (field.type === "password" || field.type === "hidden") return;
        if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;

        values[field.name] = field.value;
    });

    return values;
}

function saveFormDraft(form) {
    if (!form?.dataset?.draftKey) return;

    localStorage.setItem(formDraftKey(form), JSON.stringify(formDraftValues(form)));
}

function restoreFormDraft(form) {
    if (!form?.dataset?.draftKey) return;

    const raw = localStorage.getItem(formDraftKey(form));
    if (!raw) return;

    let values = {};
    try {
        values = JSON.parse(raw);
    } catch (error) {
        localStorage.removeItem(formDraftKey(form));
        return;
    }

    Object.entries(values).forEach(([name, value]) => {
        const fields = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
        fields.forEach((field) => {
            if (field.type === "password" || field.type === "hidden") return;
            if (field.type === "checkbox" || field.type === "radio") {
                field.checked = String(field.value) === String(value);
                return;
            }

            field.value = value;
        });
    });
}

function clearFormDraft(form) {
    if (!form?.dataset?.draftKey) return;

    localStorage.removeItem(formDraftKey(form));
}

function clearStoredFormDrafts() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("currentView");
    localStorage.removeItem("selectedRepairId");

    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("formDraft:")) {
            localStorage.removeItem(key);
        }
    });

    sessionStorage.removeItem("selectedRepairId");
    state.selectedRepairId = "";
}

function bindFormDrafts(scope = document) {
    scope.querySelectorAll("form[data-draft-key]").forEach((form) => {
        restoreFormDraft(form);
        form.addEventListener("input", () => saveFormDraft(form));
        form.addEventListener("change", () => saveFormDraft(form));
    });
}

function todayInputDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `--`;
}

function bindRegistrationInputs(scope = document) {
    scope.querySelectorAll("[data-registration-input]").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = input.value
                .toUpperCase()
                .replace(/[^A-ZА-Я0-9\s-]/g, "")
                .replace(/\s+/g, " ")
                .slice(0, 20);
        });
    });
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
