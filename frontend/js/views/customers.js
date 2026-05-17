async function renderCustomers(view) {
    const customers = await api("/customers");
    view.innerHTML = `
        <div class="grid two">
            <div class="card">
                <h3>Нов клиент</h3>
                <form class="form" data-customer-form>
                    <label>Име<input name="full_name" required></label>
                    <label>Телефон<input name="phone"></label>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line customer-search">
                    <input data-customer-search placeholder="Търси по име или телефон">
                </div>
                <div data-customers-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-customer-form]").addEventListener("submit", submitJson("/customers", "POST"));

    const renderCustomerList = (items) => {
        document.querySelector("[data-customers-list]").innerHTML = customerTable(items);
        bindCustomerActions();
    };

    renderCustomerList(customers);

    document.querySelector("[data-customer-search]").addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        const filteredCustomers = customers.filter((customer) => {
            const searchableText = [
                customer.full_name,
                customer.phone
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        });

        renderCustomerList(filteredCustomers);
    });
}

function customerTable(customers) {
    return table(["ID", "Име", "Телефон", "Действия"], customers.map((c) => [
        c.id,
        escapeHtml(c.full_name),
        escapeHtml(c.phone || "-"),
        `<button class="danger small" data-delete-customer="${c.id}">Изтрий</button>`
    ]));
}

function bindCustomerActions() {
    document.querySelectorAll("[data-delete-customer]").forEach((button) => {
        button.addEventListener("click", () => {
            deleteRecord(
                `/customers/${button.dataset.deleteCustomer}`,
                "Да изтрия ли този клиент? Свързаните автомобили, ремонти, части, часове и фактури също ще бъдат изтрити."
            );
        });
    });
}
