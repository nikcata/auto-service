async function renderCars(view) {
    const [customers, cars] = await Promise.all([api("/customers"), api("/cars")]);
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Нов автомобил</h3>
                <form class="form" data-car-form>
                    <div class="form-row">
                        <label>Клиент<select name="customer_id" required>${options(customers, "id", "full_name")}</select></label>
                        <label>Марка<input name="brand" required></label>
                    </div>
                    <div class="form-row">
                        <label>Модел<input name="model" required></label>
                        <label>Година<input name="year" type="number"></label>
                    </div>
                    <div class="form-row">
                        <label>Рег. номер<input name="registration_number"></label>
                        <label>VIN<input name="vin" data-vin-input maxlength="17" pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q." placeholder="17 символа"></label>
                    </div>
                    <div class="form-row">
                        <label>Двигател<input name="engine"></label>
                        <label>Километри<input name="mileage" type="number"></label>
                    </div>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line car-search">
                    <input data-car-search placeholder="Търси по клиент, марка, модел, рег. номер или VIN">
                </div>
                <div class="car-table" data-cars-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-car-form]").addEventListener("submit", submitJson("/cars", "POST"));
    bindVinInputs(view);

    const renderCarList = (items) => {
        document.querySelector("[data-cars-list]").innerHTML = carTable(items);
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

function carTable(cars) {
    return table(["ID", "Клиент", "Автомобил", "Рег. номер", "VIN", "Действия"], cars.map((c) => [
        c.id,
        escapeHtml(c.customer_name),
        escapeHtml(`${c.brand} ${c.model}`),
        escapeHtml(c.registration_number || "-"),
        escapeHtml(c.vin || "-"),
        `<button class="danger small" data-delete-car="${c.id}">Изтрий</button>`
    ]));
}

function bindCarActions() {
    document.querySelectorAll("[data-delete-car]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/cars/${button.dataset.deleteCar}`, "Да изтрия ли този автомобил? Свързаните ремонти също ще бъдат изтрити."));
    });
}
