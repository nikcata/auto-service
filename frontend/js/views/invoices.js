async function renderInvoices(view) {
    const invoices = await api("/invoices");
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Издадени фактури</h3>
                <div data-invoices-list>${invoiceTable(invoices)}</div>
            </div>
        </div>
    `;

    bindInvoiceActions();
}

function invoiceTable(invoices) {
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
                    ${invoices.map((i) => `
                        <tr>
                            <td>${shortText(i.invoice_number, 26)}</td>
                            <td>${shortText(i.customer_name, 26)}</td>
                            <td>${shortText(`${i.brand} ${i.model}`, 28)}</td>
                            <td>${money(i.total_amount)}</td>
                            <td>${invoiceStatusBadge(i.status)}</td>
                            <td>
                                <div class="actions">
                                    <a class="secondary small" href="${API_URL}/${escapeHtml(i.pdf_path)}" target="_blank">Отвори</a>
                                    ${isAdmin() && i.status !== "cancelled" ? `<button class="danger small" data-cancel-invoice="${i.id}">Анулирай</button>` : ""}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function invoiceStatusBadge(status) {
    if (status === "cancelled") {
        return '<span class="invoice-status status-cancelled">Анулирана</span>';
    }

    return '<span class="invoice-status status-issued">Издадена</span>';
}

async function refreshInvoiceList() {
    const list = document.querySelector("[data-invoices-list]");
    if (!list) return;

    const invoices = await api("/invoices");
    list.innerHTML = invoiceTable(invoices);
    bindInvoiceActions();
}

function bindInvoiceActions() {
    document.querySelectorAll("[data-cancel-invoice]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Да анулирам ли тази фактура? PDF файлът и записът ще останат запазени.")) return;

            try {
                await api(`/invoices/${button.dataset.cancelInvoice}/cancel`, { method: "PATCH" });
                await refreshInvoiceList();
                setNotice("Фактурата е анулирана.");
            } catch (error) {
                setNotice(error.message, true);
            }
        });
    });
}
