async function submitAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const day = values.appointment_date_day;
    const time = values.appointment_date_time;

    delete values.appointment_date_day;
    delete values.appointment_date_time;
    values.appointment_date = day + " " + time + ":00";

    const appointmentDate = new Date(`${day}T${time}:00`);
    if (!day || !time || Number.isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
        setNotice("Не може да се записва час със задна дата или минал час.", true);
        return;
    }

    try {
        await api("/appointments", {
            method: "POST",
            body: JSON.stringify(values)
        });
        clearFormDraft(form);
        setNotice("Записът е успешен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function submitJson(path, method) {
    return async (event) => {
        event.preventDefault();
        const values = normalizeFormValues(Object.fromEntries(new FormData(event.currentTarget).entries()));

        try {
            validateFormValues(values);

            await api(path, {
                method,
                body: JSON.stringify(values)
            });
            clearFormDraft(event.currentTarget);
            setNotice("Записът е успешен.");
            loadView();
        } catch (error) {
            setNotice(error.message, true);
        }
    };
}

function resetRepairPartInputs(form) {
    if (!form) return;

    const defaults = {
        part_name: "",
        brand: "",
        quantity: "1",
        unit_price: "0"
    };

    Object.entries(defaults).forEach(([name, value]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field) field.value = value;
    });
}

async function submitRepairPart(event) {
    event.preventDefault();
    const values = normalizeFormValues(Object.fromEntries(new FormData(event.currentTarget).entries()));

    try {
        await api("/repair-parts", {
            method: "POST",
            body: JSON.stringify(values)
        });

        resetRepairPartInputs(event.currentTarget);
        clearFormDraft(event.currentTarget);
        state.selectedRepairId = String(values.repair_id || "");
        sessionStorage.setItem("selectedRepairId", state.selectedRepairId);
        setNotice("Частта е добавена.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deleteRepairPart(partId) {
    if (!confirm("Да изтрия ли тази част от ремонта?")) return;

    try {
        await api(`/repair-parts/${partId}`, { method: "DELETE" });
        setNotice("Частта е изтрита.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function finishRepair(repairId) {
    if (!confirm("Готов ли е ремонтът? След това ще се появи в списъка за PDF.")) return;

    try {
        const laborBox = document.querySelector(`[data-labor-form][data-repair-id="${repairId}"]`);
        if (laborBox) {
            const fields = laborBox.querySelectorAll("input[name]");
            const values = normalizeFormValues(Object.fromEntries(Array.from(fields).map((field) => [field.name, field.value])));

            await api(`/repairs/${repairId}`, {
                method: "PUT",
                body: JSON.stringify(values)
            });
        }

        await api(`/repairs/${repairId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "completed" })
        });

        if (String(state.selectedRepairId) === String(repairId)) {
            state.selectedRepairId = "";
            sessionStorage.removeItem("selectedRepairId");
        }

        setNotice("Ремонтът е завършен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function startRepairFromAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const appointmentId = new FormData(form).get("appointment_id");

    try {
        const result = await api(`/appointments/${appointmentId}/start-repair`, { method: "POST" });
        if (result?.repair_id) {
            state.selectedRepairId = String(result.repair_id);
            sessionStorage.setItem("selectedRepairId", state.selectedRepairId);
        }

        clearFormDraft(form);
        setNotice("Ремонтът е започнат от записания час.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deleteRecord(path, message) {
    if (!confirm(message)) return;

    try {
        await api(path, { method: "DELETE" });
        setNotice("Записът е изтрит.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deleteOpenRepair(repairId) {
    if (!repairId) {
        setNotice("Първо избери ремонт.", true);
        return;
    }

    if (!confirm("Да премахна ли този започнат ремонт? Частите към него ще се изтрият, а часът от календара ще остане наличен.")) return;

    try {
        await api(`/repairs/${repairId}`, { method: "DELETE" });

        if (String(state.selectedRepairId) === String(repairId)) {
            state.selectedRepairId = "";
            sessionStorage.removeItem("selectedRepairId");
        }

        setNotice("Започнатият ремонт е премахнат.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function closeRepairDetails() {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    box.hidden = true;
    box.dataset.openRepairId = "";
    box.innerHTML = "";
}

async function renderRepairDetails(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        box.hidden = false;
        box.dataset.openRepairId = String(repairId);
        box.innerHTML = `
            <h3>Детайли за ремонт #${escapeHtml(repair.id)}</h3>
            <div class="grid two">
                <p><strong>Клиент:</strong> ${escapeHtml(repair.customer_name)}</p>
                <p><strong>Автомобил:</strong> ${escapeHtml(`${repair.brand} ${repair.model}`)}</p>
                <p><strong>Рег. номер:</strong> ${escapeHtml(repair.registration_number || "-")}</p>
                <p><strong>Майстор:</strong> ${escapeHtml(repair.mechanic_name || "-")}</p>
                <p><strong>Труд:</strong> ${escapeHtml(repair.hours_worked || 0)} ч. x ${money(repair.price_per_hour || 0)}</p>
                <p><strong>Сума труд:</strong> ${money(repair.labor_price || 0)}</p>
                <p><strong>Крайна сума:</strong> ${money(repair.total_price)}</p>
            </div>
            <p>${escapeHtml(repair.description || "")}</p>
            <div class="part-table">
                ${table(["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо"], repair.parts.map((part) => [
                    part.id,
                    shortText(part.part_name, 28),
                    shortText(part.brand || "-", 22),
                    part.quantity,
                    money(part.unit_price),
                    money(part.total_price)
                ]))}
            </div>
        `;
    } catch (error) {
        setNotice(error.message, true);
    }
}

function toggleRepairDetails(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    if (!box.hidden && box.dataset.openRepairId === String(repairId)) {
        closeRepairDetails();
        return;
    }

    renderRepairDetails(repairId);
}

async function renderRepairEdit(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        box.hidden = false;
        box.innerHTML = `
            <h3>Редакция на ремонт #${escapeHtml(repair.id)}</h3>
            <form class="form" data-repair-edit-form data-repair-id="${escapeHtml(repair.id)}">
                <input type="hidden" name="car_id" value="${escapeHtml(repair.car_id)}">
                <input type="hidden" name="status" value="${escapeHtml(repair.status || "completed")}">
                <div class="form-row">
                    <label>Дата на ремонт<input name="repair_date" type="date" required value="${formatInputDate(repair.repair_date)}"></label>
                    <label>Майстор<input name="mechanic_name" required value="${escapeHtml(repair.mechanic_name || "")}"></label>
                </div>
                <div class="form-row">
                    <label>Труд (часове)<input name="hours_worked" type="number" min="1" step="1" value="${escapeHtml(Math.max(1, Math.round(Number(repair.hours_worked || 1))))}"></label>
                    <label>Цена на час<input name="price_per_hour" type="number" step="0.01" value="${escapeHtml(repair.price_per_hour || 40)}"></label>
                </div>
                <label>Описание<textarea name="description">${escapeHtml(repair.description || "")}</textarea></label>
                <div class="actions">
                    <button class="primary">Запази промените</button>
                    <button class="secondary" type="button" data-cancel-repair-edit="${repair.id}">Отказ</button>
                </div>
            </form>
            <h4>Части към ремонта</h4>
            <div class="part-table">
                ${table(["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо", "Действия"], repair.parts.map((part) => [
                    part.id,
                    shortText(part.part_name, 28),
                    shortText(part.brand || "-", 22),
                    part.quantity,
                    money(part.unit_price),
                    money(part.total_price),
                    `<div class="actions">
                        <button class="secondary small" data-edit-part="${part.id}">Редактирай</button>
                        <button class="danger small" data-delete-part="${part.id}">Изтрий</button>
                    </div>`
                ]))}
            </div>
        `;

        document.querySelector("[data-repair-edit-form]").addEventListener("submit", submitRepairEdit);
        document.querySelector("[data-cancel-repair-edit]").addEventListener("click", closeRepairDetails);
        document.querySelectorAll("[data-edit-part]").forEach((button) => {
            button.addEventListener("click", () => renderPartEdit(repairId, button.dataset.editPart));
        });

        document.querySelectorAll("[data-delete-part]").forEach((button) => {
            button.addEventListener("click", () => deletePartFromEdit(button.dataset.deletePart, repairId));
        });
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function submitRepairEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const repairId = form.dataset.repairId;
    const values = normalizeFormValues(Object.fromEntries(new FormData(form).entries()));

    if (!repairId) {
        setNotice("Не може да се намери ремонтът за редакция.", true);
        return;
    }

    try {
        await api(`/repairs/${repairId}`, {
            method: "PUT",
            body: JSON.stringify(values)
        });

        setNotice("Ремонтът е обновен.");
        await refreshCompletedRepairList();
        const box = document.querySelector("[data-repair-detail-box]");
        if (box) {
            box.hidden = true;
            box.innerHTML = "";
        }
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function renderPartEdit(repairId, partId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        const part = (repair.parts || []).find((item) => String(item.id) === String(partId));

        if (!part) {
            setNotice("Частта не е намерена.", true);
            return;
        }

        box.hidden = false;
        box.innerHTML = `
            <h3>Редакция на част #${escapeHtml(part.id)}</h3>
            <form class="form" data-part-edit-form data-repair-id="${escapeHtml(repairId)}" data-part-id="${escapeHtml(part.id)}">
                <div class="form-row">
                    <label>Част<input name="part_name" required value="${escapeHtml(part.part_name)}"></label>
                    <label>Марка<input name="brand" value="${escapeHtml(part.brand || "")}"></label>
                </div>
                <div class="form-row">
                    <label>Брой<input name="quantity" type="number" value="${escapeHtml(part.quantity || 1)}"></label>
                    <label>Ед. цена<input name="unit_price" type="number" step="0.01" value="${escapeHtml(part.unit_price || 0)}"></label>
                </div>
                <div class="actions">
                    <button class="primary">Запази част</button>
                    <button class="secondary" type="button" data-cancel-part-edit="${escapeHtml(repairId)}">Отказ</button>
                </div>
            </form>
        `;

        document.querySelector("[data-part-edit-form]").addEventListener("submit", submitPartEdit);
        document.querySelector("[data-cancel-part-edit]").addEventListener("click", () => renderRepairEdit(repairId));
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function submitPartEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const repairId = form.dataset.repairId;
    const partId = form.dataset.partId;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
        await api(`/repair-parts/${partId}`, {
            method: "PUT",
            body: JSON.stringify(values)
        });

        setNotice("Частта е обновена.");
        await refreshCompletedRepairList();
        renderRepairEdit(repairId);
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deletePartFromEdit(partId, repairId) {
    if (!confirm("Да изтрия ли тази част от ремонта?")) return;

    try {
        await api(`/repair-parts/${partId}`, { method: "DELETE" });
        setNotice("Частта е изтрита.");
        await refreshCompletedRepairList();
        renderRepairEdit(repairId);
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function generateInvoice(event) {
    event.preventDefault();
    const repairId = event.currentTarget.dataset.invoice;

    try {
        const repair = await api(`/repairs/${repairId}`);
        showInvoicePreview(repair);
        setNotice("Прегледай данните и потвърди издаването на фактурата.");
    } catch (error) {
        setNotice(error.message, true);
    }
}

function showInvoicePreview(repair) {
    const parts = repair.parts || [];
    const partsTotal = parts.reduce((sum, part) => sum + Number(part.total_price || 0), 0);
    const finalTotal = Number(repair.labor_price || 0) + partsTotal;

    modalRoot.innerHTML = `
        <div class="modal-backdrop" data-close-invoice-preview>
            <div class="modal-card invoice-preview-modal" role="dialog" aria-modal="true" aria-label="Преглед преди фактура">
                <div class="modal-head">
                    <div>
                        <h3>Преглед преди фактура</h3>
                        <p>Ремонт #${escapeHtml(repair.id)}</p>
                    </div>
                    <button class="secondary small" data-close-invoice-preview type="button">Затвори</button>
                </div>
                <div class="invoice-preview-body">
                    <div class="invoice-preview-grid">
                        <p><strong>Клиент:</strong> ${escapeHtml(repair.customer_name || "-")}</p>
                        <p><strong>Автомобил:</strong> ${escapeHtml(`${repair.brand || ""} ${repair.model || ""}`.trim() || "-")}</p>
                        <p><strong>Рег. номер:</strong> ${escapeHtml(repair.registration_number || "-")}</p>
                        <p><strong>Майстор:</strong> ${escapeHtml(repair.mechanic_name || "-")}</p>
                        <p><strong>Труд:</strong> ${escapeHtml(repair.hours_worked || 0)} ч. x ${money(repair.price_per_hour || 0)}</p>
                        <p><strong>Сума труд:</strong> ${money(repair.labor_price || 0)}</p>
                    </div>
                    <div class="invoice-preview-description">
                        <strong>Описание:</strong>
                        <p>${escapeHtml(repair.description || "-")}</p>
                    </div>
                    <div class="invoice-preview-parts">
                        <h4>Части</h4>
                        ${parts.length ? table(["Част", "Марка", "Бр.", "Ед. цена", "Общо"], parts.map((part) => [
                            shortText(part.part_name, 28),
                            shortText(part.brand || "-", 22),
                            part.quantity,
                            money(part.unit_price),
                            money(part.total_price)
                        ])) : '<p class="empty">Няма добавени части.</p>'}
                    </div>
                    <div class="invoice-preview-total">
                        <span>Крайна сума</span>
                        <strong>${money(finalTotal)}</strong>
                    </div>
                    <div class="actions invoice-preview-actions">
                        <button class="secondary" data-close-invoice-preview type="button">Отказ</button>
                        <button class="primary" data-confirm-invoice="${escapeHtml(repair.id)}" type="button">Потвърди и издай</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modalRoot.querySelectorAll("[data-close-invoice-preview]").forEach((element) => {
        element.addEventListener("click", (event) => {
            if (event.target === element || element.tagName === "BUTTON") {
                modalRoot.innerHTML = "";
            }
        });
    });

    modalRoot.querySelector("[data-confirm-invoice]").addEventListener("click", confirmGenerateInvoice);
}

async function confirmGenerateInvoice(event) {
    const button = event.currentTarget;
    const repairId = button.dataset.confirmInvoice;
    const originalText = button.textContent;
    const invoiceWindow = window.open("about:blank", "_blank");

    button.disabled = true;
    button.textContent = "Генериране...";

    try {
        const result = await api(`/invoice/${repairId}`);
        const invoiceUrl = `${API_URL}/${result.file}`;

        modalRoot.innerHTML = "";
        if (invoiceWindow) {
            invoiceWindow.location.href = invoiceUrl;
        } else {
            modalRoot.innerHTML = `
                <div class="modal-backdrop" data-close-invoice-preview>
                    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Фактурата е готова">
                        <div class="modal-head">
                            <h3>Фактурата е готова</h3>
                            <button class="secondary small" data-close-invoice-preview type="button">Затвори</button>
                        </div>
                        <a class="primary" href="${escapeHtml(invoiceUrl)}" target="_blank">Отвори фактура</a>
                    </div>
                </div>
            `;
            modalRoot.querySelectorAll("[data-close-invoice-preview]").forEach((element) => {
                element.addEventListener("click", (closeEvent) => {
                    if (closeEvent.target === element || element.tagName === "BUTTON") {
                        modalRoot.innerHTML = "";
                    }
                });
            });
        }
        setNotice("Фактурата е генерирана.");
        await refreshInvoiceList();
        if (typeof refreshCompletedRepairList === "function") {
            await refreshCompletedRepairList();
        }
    } catch (error) {
        if (invoiceWindow) {
            invoiceWindow.close();
        }
        button.disabled = false;
        button.textContent = originalText;
        setNotice(error.message, true);
        if ((error.message || "").includes("вече има фактура") && typeof refreshCompletedRepairList === "function") {
            modalRoot.innerHTML = "";
            await refreshCompletedRepairList();
            await refreshInvoiceList();
        }
    }
}

function options(items, valueKey, labelKey, selectedValue = "") {
    return items.map((item) => {
        const label = typeof labelKey === "function" ? labelKey(item) : item[labelKey];
        const value = item[valueKey];
        const selected = String(value) === String(selectedValue) ? " selected" : "";

        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("");
}

function searchableSelect(name, items, config = {}) {
    const selectedValue = String(config.selectedValue ?? "");
    const placeholder = config.placeholder || "Избери";
    const searchPlaceholder = config.searchPlaceholder || placeholder;
    const required = config.required === false ? "" : " required";
    const selectedItem = items.find((item) => String(item.value ?? "") === selectedValue);
    const itemOptions = items.map((item) => {
        const value = String(item.value ?? "");
        const label = String(item.label ?? "");
        const selected = value === selectedValue ? " selected" : "";

        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("");

    return `
        <div class="searchable-select" data-searchable-select data-placeholder="${escapeHtml(placeholder)}" data-options='${escapeHtml(JSON.stringify(items))}'>
            <input class="select-display" data-select-search type="search" placeholder="${escapeHtml(searchPlaceholder)}" autocomplete="off" value="${escapeHtml(selectedItem?.label || "")}"${required}>
            <select class="native-select-hidden" name="${escapeHtml(name)}" tabindex="-1" aria-hidden="true">
                <option value="">${escapeHtml(placeholder)}</option>
                ${itemOptions}
            </select>
            <div class="select-menu" data-select-menu hidden></div>
            <small class="select-count" data-select-count></small>
        </div>
    `;
}

function setupSearchableSelects(scope = document) {
    scope.querySelectorAll("[data-searchable-select]").forEach((box) => {
        if (box.dataset.searchableReady === "true") return;

        const input = box.querySelector("[data-select-search]");
        const select = box.querySelector("select");
        const menu = box.querySelector("[data-select-menu]");
        const count = box.querySelector("[data-select-count]");
        if (!input || !select || !menu) return;

        let items = [];
        try {
            items = JSON.parse(box.dataset.options || "[]").map((item) => ({
                value: String(item.value ?? ""),
                label: String(item.label ?? "")
            }));
        } catch (error) {
            items = [];
        }

        const placeholder = box.dataset.placeholder || "Избери";
        const matchesQuery = (item, query) => item.label.toLowerCase().includes(query);
        const selectedLabel = () => items.find((item) => item.value === String(select.value || ""))?.label || "";
        const setValidState = () => {
            input.setCustomValidity(select.value ? "" : "Избери запис от списъка");
        };

        const closeMenu = () => {
            menu.hidden = true;
            input.value = selectedLabel();
            setValidState();
        };

        const chooseItem = (item) => {
            select.value = item.value;
            input.value = item.label;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            setValidState();
            menu.hidden = true;
        };

        const renderOptions = () => {
            const pendingValue = box.dataset.pendingValue;
            if (pendingValue !== undefined) {
                select.value = pendingValue;
                input.value = selectedLabel();
                delete box.dataset.pendingValue;
            }

            const query = input.value.trim().toLowerCase();
            const currentLabel = selectedLabel().toLowerCase();
            const searchQuery = query && query !== currentLabel ? query : "";
            const matched = searchQuery ? items.filter((item) => matchesQuery(item, searchQuery)) : items;
            menu.innerHTML = matched.length
                ? matched.map((item) => `
                    <button class="select-option${item.value === String(select.value || "") ? " active" : ""}" type="button" data-select-value="${escapeHtml(item.value)}" title="${escapeHtml(item.label)}">
                        ${escapeHtml(item.label)}
                    </button>
                `).join("")
                : `<div class="select-empty">Няма намерени записи.</div>`;

            if (count) count.textContent = "";
            setValidState();
        };

        input.addEventListener("focus", () => {
            input.select();
            renderOptions();
            menu.hidden = false;
        });

        input.addEventListener("input", () => {
            select.value = "";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            renderOptions();
            menu.hidden = false;
        });

        menu.addEventListener("click", (event) => {
            const button = event.target.closest("[data-select-value]");
            if (!button) return;
            const item = items.find((entry) => entry.value === button.dataset.selectValue);
            if (item) chooseItem(item);
        });

        document.addEventListener("click", (event) => {
            if (!box.contains(event.target)) closeMenu();
        });

        box.renderSearchableOptions = renderOptions;
        box.dataset.searchableReady = "true";
        input.value = selectedLabel();
        renderOptions();
    });
}

function setSearchableSelectValue(select, value) {
    const box = select?.closest?.("[data-searchable-select]");
    if (!box) {
        if (select) select.value = value || "";
        return;
    }

    box.dataset.pendingValue = String(value || "");
    if (typeof box.renderSearchableOptions === "function") {
        box.renderSearchableOptions();
    }
    select.value = String(value || "");
}

function table(headers, rows) {
    if (!rows.length) return `<p class="empty">Няма записи.</p>`;

    return `
        <div class="table-scroll list-scroll">
            <table>
                <thead>
                    <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? "-" : cell}</td>`).join("")}</tr>`).join("")}
                </tbody>
            </table>
        </div>
    `;
}
