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
        <div class="table-scroll">
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>Номер</th>
                        <th>Клиент</th>
                        <th>Автомобил</th>
                        <th>Сума</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map((i) => `
                        <tr>
                            <td>${escapeHtml(i.invoice_number)}</td>
                            <td>${escapeHtml(i.customer_name)}</td>
                            <td>${escapeHtml(`${i.brand} ${i.model}`)}</td>
                            <td>${money(i.total_amount)}</td>
                            <td>
                                <div class="actions">
                                    <a class="secondary small" href="${API_URL}/${escapeHtml(i.pdf_path)}" target="_blank">Отвори</a>
                                    ${isAdmin() ? `<button class="danger small" data-delete-invoice="${i.id}">Изтрий</button>` : ""}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function refreshInvoiceList() {
    const list = document.querySelector("[data-invoices-list]");
    if (!list) return;

    const invoices = await api("/invoices");
    list.innerHTML = invoiceTable(invoices);
    bindInvoiceActions();
}

function bindInvoiceActions() {
    document.querySelectorAll("[data-delete-invoice]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Да изтрия ли тази фактура? PDF файлът също ще бъде премахнат.")) return;

            try {
                await api(`/invoices/${button.dataset.deleteInvoice}`, { method: "DELETE" });
                await refreshInvoiceList();
                setNotice("Фактурата е изтрита.");
            } catch (error) {
                setNotice(error.message, true);
            }
        });
    });
}
