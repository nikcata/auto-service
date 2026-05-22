async function renderCustomers(view) {
    const customers = await api("/customers");
    view.innerHTML = `
        <div class="grid two">
            <div class="card">
                <h3 data-customer-form-title>Нов клиент</h3>
                <form class="form" data-customer-form data-draft-key="customers:new">
                    <label>Име<input name="full_name" required minlength="2" pattern="[A-Za-zА-Яа-яЁёЀ-ӿ]+(?:[\\s'-][A-Za-zА-Яа-яЁёЀ-ӿ]+)*" title="Само букви, интервал, тире или апостроф"></label>
                    <label>Телефон<input name="phone" required inputmode="tel" pattern="(?:\\+359|0)[\\s-]*\\(?[7-9]\\d{2}\\)?[\\s-]*\\d{3}[\\s-]*\\d{3}" title="Например 0888123456 или +359 888 123 456"></label>
                    <div class="actions">
                        <button class="primary" data-customer-submit>Запази</button>
                        <button class="secondary" type="button" data-customer-cancel hidden>Отказ</button>
                    </div>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line customer-search">
                    <input data-customer-search placeholder="Търси по име или телефон">
                </div>
                <div class="customer-table" data-customers-list></div>
            </div>
        </div>
    `;

    const customerForm = document.querySelector("[data-customer-form]");
    customerForm.addEventListener("submit", submitCustomerForm);
    document.querySelector("[data-customer-cancel]").addEventListener("click", () => resetCustomerForm(customerForm));

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
    const headers = isAdmin() ? ["ID", "Име", "Телефон", "Действия"] : ["ID", "Име", "Телефон"];

    return table(headers, customers.map((c) => {
        const row = [
            c.id,
            shortText(c.full_name, 20),
            shortText(c.phone || "-", 13)
        ];

        if (isAdmin()) {
            row.push(`<div class="actions">
                <button class="secondary small" data-edit-customer="${c.id}">Редактирай</button>
                <button class="danger small" data-delete-customer="${c.id}">Изтрий</button>
            </div>`);
        }

        return row;
    }));
}

async function submitCustomerForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const editId = form.dataset.editId;
    const values = normalizeFormValues(Object.fromEntries(new FormData(form).entries()));

    try {
        await api(editId ? `/customers/${editId}` : "/customers", {
            method: editId ? "PUT" : "POST",
            body: JSON.stringify(values)
        });

        clearFormDraft(form);
        setNotice(editId ? "Клиентът е обновен." : "Записът е успешен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function resetCustomerForm(form) {
    form.reset();
    delete form.dataset.editId;
    document.querySelector("[data-customer-form-title]").textContent = "Нов клиент";
    document.querySelector("[data-customer-submit]").textContent = "Запази";
    document.querySelector("[data-customer-cancel]").hidden = true;
}

async function editCustomer(customerId) {
    const form = document.querySelector("[data-customer-form]");
    if (!form) return;

    try {
        const customer = await api(`/customers/${customerId}`);
        form.dataset.editId = customerId;
        form.elements.full_name.value = customer.full_name || "";
        form.elements.phone.value = customer.phone || "";
        document.querySelector("[data-customer-form-title]").textContent = `Редакция на клиент #${customerId}`;
        document.querySelector("[data-customer-submit]").textContent = "Запази промените";
        document.querySelector("[data-customer-cancel]").hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        setNotice(error.message, true);
    }
}

function bindCustomerActions() {
    document.querySelectorAll("[data-edit-customer]").forEach((button) => {
        button.addEventListener("click", () => editCustomer(button.dataset.editCustomer));
    });

    document.querySelectorAll("[data-delete-customer]").forEach((button) => {
        button.addEventListener("click", () => {
            deleteRecord(
                `/customers/${button.dataset.deleteCustomer}`,
                "Да архивирам ли този клиент? Старите ремонти и фактури ще останат запазени."
            );
        });
    });
}
