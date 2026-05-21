async function renderArchive(view) {
    const [repairs, invoices] = await Promise.all([
        api("/repairs/archive"),
        api("/invoices/archive")
    ]);

    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Архивирани ремонти</h3>
                <div class="repair-table archive-repair-list table-scroll list-scroll">
                    ${archiveRepairsTable(repairs)}
                </div>
            </div>
            <div class="card" data-archive-repair-detail-box hidden></div>
            <div class="card">
                <h3>Анулирани фактури</h3>
                <div data-archive-invoices-list>${archiveInvoicesTable(invoices)}</div>
            </div>
        </div>
    `;

    bindArchiveActions();
}

function archiveRepairsTable(repairs) {
    if (!repairs.length) {
        return `<p class="empty">Няма архивирани ремонти.</p>`;
    }

    return table(["ID", "Клиент", "Автомобил", "Дата", "Майстор", "Сума", "Архивиран", "Действия"], repairs.map((repair) => [
        repair.id,
        twoLineName(repair.customer_name, 12, 12),
        shortText(`${repair.brand} ${repair.model}`, 20),
        formatDate(repair.repair_date),
        shortText(repair.mechanic_name || "-", 18),
        money(repair.total_price),
        formatDate(repair.archived_at),
        `<div class="actions"><button class="secondary small" data-archive-repair-detail="${repair.id}">Детайли</button><button class="secondary small" data-restore-archive-repair="${repair.id}">Възстанови</button></div>`
    ]));
}

function archiveInvoicesTable(invoices) {
    if (!invoices.length) {
        return `<p class="empty">Няма анулирани фактури.</p>`;
    }

    return `
        <div class="table-scroll list-scroll">
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>Номер</th>
                        <th>Клиент</th>
                        <th>Автомобил</th>
                        <th>Сума</th>
                        <th>Статус</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map((invoice) => `
                        <tr>
                            <td>${shortText(invoice.invoice_number, 26)}</td>
                            <td>${shortText(invoice.customer_name, 26)}</td>
                            <td>${shortText(`${invoice.brand} ${invoice.model}`, 28)}</td>
                            <td>${money(invoice.total_amount)}</td>
                            <td>${invoiceStatusBadge(invoice.status)}</td>
                            <td>
                                <div class="actions">
                                    <a class="secondary small" href="${API_URL}/${escapeHtml(invoice.pdf_path)}" target="_blank">Отвори</a>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function bindArchiveActions() {
    document.querySelectorAll("[data-archive-repair-detail]").forEach((button) => {
        button.addEventListener("click", () => toggleArchiveRepairDetails(button.dataset.archiveRepairDetail));
    });

    document.querySelectorAll("[data-restore-archive-repair]").forEach((button) => {
        button.addEventListener("click", () => restoreArchivedRepair(button.dataset.restoreArchiveRepair));
    });
}

async function restoreArchivedRepair(repairId) {
    if (!confirm("Да върна ли този ремонт в завършени ремонти?")) return;

    try {
        await api(`/repairs/${repairId}/restore`, { method: "PATCH" });
        setNotice("Ремонтът е възстановен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function toggleArchiveRepairDetails(repairId) {
    const box = document.querySelector("[data-archive-repair-detail-box]");
    if (!box) return;

    if (!box.hidden && box.dataset.repairId === String(repairId)) {
        box.hidden = true;
        box.innerHTML = "";
        delete box.dataset.repairId;
        return;
    }

    try {
        const repair = await api(`/repairs/${repairId}`);
        box.dataset.repairId = String(repairId);
        box.hidden = false;
        box.innerHTML = archiveRepairDetailsContent(repair);
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        setNotice(error.message, true);
    }
}


function archiveRepairDetailsContent(repair) {
    return `
        <h3>Детайли за архивиран ремонт #${escapeHtml(repair.id)}</h3>
        <div class="grid two">
            <p><strong>Клиент:</strong> ${escapeHtml(repair.customer_name)}</p>
            <p><strong>Автомобил:</strong> ${escapeHtml(`${repair.brand} ${repair.model}`)}</p>
            <p><strong>Рег. номер:</strong> ${escapeHtml(repair.registration_number || "-")}</p>
            <p><strong>Майстор:</strong> ${escapeHtml(repair.mechanic_name || "-")}</p>
            <p><strong>Дата:</strong> ${formatDate(repair.repair_date)}</p>
            <p><strong>Архивиран:</strong> ${formatDate(repair.archived_at)}</p>
            <p><strong>Труд:</strong> ${escapeHtml(repair.hours_worked || 0)} ч. x ${money(repair.price_per_hour || 0)}</p>
            <p><strong>Сума труд:</strong> ${money(repair.labor_price || 0)}</p>
            <p><strong>Крайна сума:</strong> ${money(repair.total_price)}</p>
        </div>
        <p>${escapeHtml(repair.description || "")}</p>
        <div class="part-table">
            ${table(["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо"], (repair.parts || []).map((part) => [
                part.id,
                shortText(part.part_name, 28),
                shortText(part.brand || "-", 22),
                part.quantity,
                money(part.unit_price),
                money(part.total_price)
            ]))}
        </div>
    `;
}
