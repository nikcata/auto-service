async function renderCars(view) {
    const [customers, cars, appointments] = await Promise.all([api("/customers"), api("/cars"), api("/appointments")]);
    const sortedCustomers = [...customers].sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "bg", { sensitivity: "base" }));
    const carsWithAppointments = new Set(appointments.filter((appointment) => appointment.status === "scheduled").map((appointment) => String(appointment.car_id)));

    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3 data-car-form-title>Нов автомобил</h3>
                <form class="form" data-car-form data-draft-key="cars:new:v2">
                    <div class="form-row">
                        <label>Клиент<select name="customer_id" required>${options(sortedCustomers, "id", (customer) => `${customer.full_name} - ${customer.phone || "без телефон"}`)}</select></label>
                        <label>Марка<input name="brand" required minlength="2" pattern="[A-Za-zА-Яа-яЁёЀ-ӿ0-9][A-Za-zА-Яа-яЁёЀ-ӿ0-9\\s.'/-]*" title="Букви, цифри, интервал, точка, тире или /"></label>
                    </div>
                    <div class="form-row">
                        <label>Модел<input name="model" required minlength="1" pattern="[A-Za-zА-Яа-яЁёЀ-ӿ0-9][A-Za-zА-Яа-яЁёЀ-ӿ0-9\\s.'/-]*" title="Букви, цифри, интервал, точка, тире или /"></label>
                        <label>Година<input name="year" type="number" min="1900" max="2027"></label>
                    </div>
                    <div class="form-row">
                        <label>Рег. номер<input name="registration_number" required data-registration-input maxlength="20" pattern="[A-ZА-Я0-9][A-ZА-Я0-9\\s-]{1,18}[A-ZА-Я0-9]" title="Букви, цифри, интервал и тире. Например CB1234AB, W-123-AB или DE AB 1234"></label>
                        <label>VIN<input name="vin" data-vin-input maxlength="17" pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q." placeholder="17 символа"></label>
                    </div>
                    <div class="form-row">
                        <label>Двигател<input name="engine" pattern="[A-Za-zА-Яа-яЁёЀ-ӿ0-9][A-Za-zА-Яа-яЁёЀ-ӿ0-9\\s.,'/-]*" title="Букви, цифри, интервал, точка, запетая, тире или /"></label>
                        <label>Километри<input name="mileage" type="number" min="0" max="2000000" step="1"></label>
                    </div>
                    <div class="actions">
                        <button class="primary" data-car-submit>Запази</button>
                        <button class="secondary" type="button" data-car-cancel hidden>Отказ</button>
                    </div>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line car-search">
                    <input data-car-search placeholder="Търси по клиент, марка, модел, рег. номер или VIN">
                </div>
                <div class="car-table ${isAdmin() ? "admin-car-table" : "mechanic-car-table"}" data-cars-list></div>
            </div>
        </div>
    `;

    const carForm = document.querySelector("[data-car-form]");
    carForm.addEventListener("submit", submitCarForm);
    document.querySelector("[data-car-cancel]").addEventListener("click", () => resetCarForm(carForm));
    bindRegistrationInputs(view);
    bindVinInputs(view);

    const renderCarList = (items) => {
        document.querySelector("[data-cars-list]").innerHTML = carTable(items, carsWithAppointments);
        bindCarActions();
    };

    renderCarList(cars);

    document.querySelector("[data-car-search]").addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        const filteredCars = cars.filter((car) => {
            const searchableText = [
                car.customer_name,
                car.brand,
                car.model,
                car.registration_number,
                car.vin
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        });

        renderCarList(filteredCars);
    });
}

function scheduleAppointmentForCar(customerId, carId) {
    const draftKey = `formDraft:${state.user?.id || "guest"}:appointments:new`;
    let draft = {};

    try {
        draft = JSON.parse(localStorage.getItem(draftKey) || "{}");
    } catch (error) {
        draft = {};
    }

    localStorage.setItem(draftKey, JSON.stringify({
        ...draft,
        customer_id: customerId,
        car_id: carId
    }));

    state.view = "appointments";
    sessionStorage.setItem("currentView", state.view);
    render();
}

function carTable(cars, carsWithAppointments = new Set()) {
    return table(["ID", "Клиент", "Автомобил", "Рег. номер", "VIN", "Действия"], cars.map((c) => [
        c.id,
        shortText(c.customer_name, 20),
        shortText(`${c.brand} ${c.model}`, 24),
        shortText(c.registration_number || "-", 12),
        isAdmin() ? shortText(c.vin || "-", 14) : shortText(c.vin || "-", 17),
        `<div class="actions">
            <button class="secondary small car-appointment-button ${carsWithAppointments.has(String(c.id)) ? "saved" : ""}" data-schedule-car="${c.id}" data-customer-id="${c.customer_id}" title="${carsWithAppointments.has(String(c.id)) ? "Има активен записан час" : "Запиши час в календара"}">Запиши час</button>
            ${isAdmin() ? `<button class="secondary small" data-edit-car="${c.id}">Редактирай</button><button class="danger small" data-delete-car="${c.id}">Изтрий</button>` : ""}
        </div>`
    ]));
}

async function submitCarForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const editId = form.dataset.editId;
    const values = normalizeFormValues(Object.fromEntries(new FormData(form).entries()));

    try {
        validateFormValues(values);

        await api(editId ? `/cars/${editId}` : "/cars", {
            method: editId ? "PUT" : "POST",
            body: JSON.stringify(values)
        });

        clearFormDraft(form);
        setNotice(editId ? "Автомобилът е обновен." : "Записът е успешен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function resetCarForm(form) {
    form.reset();
    delete form.dataset.editId;
    delete form.dataset.draftPaused;
    document.querySelector("[data-car-form-title]").textContent = "Нов автомобил";
    document.querySelector("[data-car-submit]").textContent = "Запази";
    document.querySelector("[data-car-cancel]").hidden = true;
}

async function editCar(carId) {
    const form = document.querySelector("[data-car-form]");
    if (!form) return;

    try {
        const car = await api(`/cars/${carId}`);
        clearFormDraft(form);
        form.dataset.draftPaused = "true";
        form.dataset.editId = carId;
        form.elements.customer_id.value = car.customer_id || "";
        form.elements.brand.value = car.brand || "";
        form.elements.model.value = car.model || "";
        form.elements.year.value = car.year || "";
        form.elements.registration_number.value = car.registration_number || "";
        form.elements.vin.value = car.vin || "";
        form.elements.engine.value = car.engine || "";
        form.elements.mileage.value = car.mileage || "";
        document.querySelector("[data-car-form-title]").textContent = `Редакция на автомобил #${carId}`;
        document.querySelector("[data-car-submit]").textContent = "Запази промените";
        document.querySelector("[data-car-cancel]").hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        setNotice(error.message, true);
    }
}

function bindCarActions() {
    document.querySelectorAll("[data-schedule-car]").forEach((button) => {
        button.addEventListener("click", () => scheduleAppointmentForCar(button.dataset.customerId, button.dataset.scheduleCar));
    });

    document.querySelectorAll("[data-edit-car]").forEach((button) => {
        button.addEventListener("click", () => editCar(button.dataset.editCar));
    });

    document.querySelectorAll("[data-delete-car]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/cars/${button.dataset.deleteCar}`, "Да архивирам ли този автомобил? Старите ремонти и фактури ще останат запазени."));
    });
}
