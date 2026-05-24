async function renderUsers(view) {
    const users = await api("/users");

    view.innerHTML = `
        <div class="grid two">
            <div class="card">
                <h3>Нов потребител</h3>
                <form class="form" data-user-form data-draft-key="users:new">
                    <label>Потребителско име<input name="username" required autocomplete="off"></label>
                    <label>Роля
                        <select name="role">
                            <option value="mechanic">Механик</option>
                            <option value="admin">Админ</option>
                        </select>
                    </label>
                    <button class="primary">Създай потребител</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div data-users-list>${userTable(users)}</div>
            </div>
        </div>
    `;

    document.querySelector("[data-user-form]").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());

        try {
            await api("/users", {
                method: "POST",
                body: JSON.stringify(values)
            });

            clearFormDraft(form);
            form.reset();
            await refreshUserList();
            setNotice("Потребителят е създаден.");
        } catch (error) {
            setNotice(error.message, true);
        }
    });

    bindUserActions();
}

function userTable(users) {
    return `<div class="user-table">${table(["Потребител", "Роля", "Статус", "Действия"], users.map((user) => [
        shortText(user.username, 28),
        user.role === "admin" ? "Админ" : "Механик",
        user.has_password ? "Парола зададена" : "Очаква парола",
        user.id === state.user?.id
            ? `<span class="muted">Текущ акаунт</span>`
            : `<button class="danger small" data-delete-user="${user.id}">Изтрий</button>`
    ]))}</div>`;
}

async function refreshUserList() {
    const list = document.querySelector("[data-users-list]");
    if (!list) return;

    const users = await api("/users");
    list.innerHTML = userTable(users);
    bindUserActions();
}

function bindUserActions() {
    document.querySelectorAll("[data-delete-user]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Да изтрия ли този потребител?")) return;

            try {
                await api(`/users/${button.dataset.deleteUser}`, { method: "DELETE" });
                await refreshUserList();
                setNotice("Потребителят е изтрит.");
            } catch (error) {
                setNotice(error.message, true);
            }
        });
    });
}
