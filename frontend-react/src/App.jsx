import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, formatDate, formatDateTime, money } from "./api";
import "./App.css";

const navItems = [
  ["dashboard", "Табло"],
  ["customers", "Клиенти"],
  ["cars", "Автомобили"],
  ["repairs", "Ремонти"],
  ["appointments", "Календар"],
  ["invoices", "Фактури"],
  ["archive", "Архив"],
  ["users", "Потребители"],
];

const statusLabels = {
  scheduled: "Записан",
  completed: "Завършен",
  cancelled: "Отказан",
  open: "Отворен",
};

const appointmentStatusFilters = [
  { value: "all", label: "Всички" },
  { value: "scheduled", label: "Записани" },
  { value: "completed", label: "Завършени" },
  { value: "cancelled", label: "Отказани" },
];

const incomePeriodLabels = {
  week: "Седмица",
  month: "Месец",
  three_months: "3 месеца",
  year: "Година",
};

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("token"));
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem("user") || "null"));
  const [view, setView] = useState(() => sessionStorage.getItem("reactView") || "dashboard");
  const [notice, setNoticeText] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const isAdmin = user?.role === "admin";

  function setNotice(message, isError = false) {
    setNoticeText(message);
    setNoticeError(Boolean(isError));
  }

  function handleLogin(result) {
    sessionStorage.setItem("token", result.token);
    sessionStorage.setItem("user", JSON.stringify(result.user));
    sessionStorage.setItem("reactView", "dashboard");
    setToken(result.token);
    setUser(result.user);
    setView("dashboard");
    setNotice("");
  }

  function logout() {
    if (!confirm("Сигурен ли си, че искаш да излезеш?")) return;
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("reactView");
    setToken(null);
    setUser(null);
    setView("dashboard");
  }

  function changeView(nextView) {
    sessionStorage.setItem("reactView", nextView);
    setView(nextView);
    setNotice("");
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const visibleNav = navItems.filter(([id]) => isAdmin || !["archive", "users"].includes(id));

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <img className="sidebar-logo" src="/autoservice.png" alt="nmmotorsport" />
        <nav className="nav">
          {visibleNav.map(([id, label]) => (
            <button className={view === id ? "active" : ""} key={id} onClick={() => changeView(id)}>
              {label}
            </button>
          ))}
          <button onClick={logout}>Изход</button>
        </nav>
      </aside>
      <main className="main">
        <header className="page-head">
          <h1>{visibleNav.find(([id]) => id === view)?.[1] || "Табло"}</h1>
        </header>
        {notice && <p className={`notice ${noticeError ? "error" : ""}`}>{notice}</p>}
        <PageRouter view={view} isAdmin={isAdmin} setNotice={setNotice} setView={changeView} />
      </main>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submitLogin(event) {
    event.preventDefault();
    setError("");

    try {
      const result = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      onLogin(result);
    } catch (loginError) {
      if (loginError.code === "PASSWORD_SETUP_REQUIRED") {
        setMode("password");
        setError("Този потребител няма парола. Задай парола, за да продължиш.");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }
      setError(loginError.message);
    }
  }

  function showPasswordSetup() {
    setMode("password");
    setError("");
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
  }

  function showLogin() {
    setMode("login");
    setError("");
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
  }

  async function submitPassword(event) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Паролите не съвпадат.");
      return;
    }

    try {
      await apiRequest("/password/reset", {
        method: "POST",
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      setMode("login");
      setError("Паролата е запазена. Влез с новата парола.");
      setForm({ ...form, password: "", confirmPassword: "" });
    } catch (passwordError) {
      setError(passwordError.message);
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <img className="brand-logo" src="/autoservice.png" alt="nmmotorsport" />
          <p>Управление на клиенти, автомобили, ремонти и фактури</p>
        </div>
        {error && <p className={error.includes("запазена") ? "notice" : "notice error"}>{error}</p>}
        <form className="form" onSubmit={mode === "login" ? submitLogin : submitPassword}>
          <label>
            Потребителско име
            <input name="username" value={form.username} onChange={updateField} required autoComplete="username" />
          </label>
          <label>
            {mode === "login" ? "Парола" : "Нова парола"}
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "password" ? 4 : undefined}
              maxLength={mode === "password" ? 8 : undefined}
              pattern={mode === "password" ? "(?=.*[A-Za-zА-Яа-я])(?=.*\\d).{4,8}" : undefined}
              title={mode === "password" ? "Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра" : undefined}
            />
          </label>
          {mode === "password" && (
            <label>
              Повтори паролата
              <input
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={updateField}
                required
                autoComplete="new-password"
                minLength="4"
                maxLength="8"
                pattern="(?=.*[A-Za-zА-Яа-я])(?=.*\d).{4,8}"
                title="Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра"
              />
            </label>
          )}
          <button className="primary">{mode === "login" ? "Вход" : "Запази парола"}</button>
          {mode === "login" && (
            <button className="secondary" type="button" onClick={showPasswordSetup}>
              Задай/смени парола
            </button>
          )}
          {mode === "password" && (
            <button className="secondary" type="button" onClick={showLogin}>
              Назад към вход
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

function PageRouter({ view, isAdmin, setNotice, setView }) {
  if (view === "dashboard") return <Dashboard isAdmin={isAdmin} />;
  if (view === "customers") return <Customers isAdmin={isAdmin} setNotice={setNotice} />;
  if (view === "cars") return <Cars isAdmin={isAdmin} setNotice={setNotice} setView={setView} />;
  if (view === "repairs") return <Repairs isAdmin={isAdmin} setNotice={setNotice} />;
  if (view === "appointments") return <Appointments setNotice={setNotice} />;
  if (view === "invoices") return <Invoices isAdmin={isAdmin} setNotice={setNotice} />;
  if (view === "archive" && isAdmin) return <Archive setNotice={setNotice} />;
  if (view === "users" && isAdmin) return <Users setNotice={setNotice} />;
  return <Dashboard isAdmin={isAdmin} />;
}

function useApiData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function reload() {
    setError("");
    try {
      setData(await loader());
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    reload();
  }, deps);

  return { data, error, reload };
}

function Dashboard({ isAdmin }) {
  const [incomePeriod, setIncomePeriod] = useState(() => localStorage.getItem("incomePeriod") || "month");
  const [showIncome, setShowIncome] = useState(false);
  const [calendarMode, setCalendarMode] = useState(() => localStorage.getItem("dashboardCalendarMode") || "week");
  const [calendarDate, setCalendarDate] = useState(() => storedCalendarDate(localStorage.getItem("dashboardCalendarMode") || "week"));
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const { data, error } = useApiData(
    async () => {
      const [stats, appointments] = await Promise.all([
        apiRequest(`/stats?income_period=${incomePeriod}`),
        apiRequest("/appointments"),
      ]);
      return { stats, appointments };
    },
    [incomePeriod]
  );

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const calendar = calendarMode === "month"
    ? buildMonthCalendar(calendarDate, data.appointments)
    : buildWeekCalendar(calendarDate, data.appointments);

  function changeIncomePeriod(value) {
    localStorage.setItem("incomePeriod", value);
    setIncomePeriod(value);
  }

  function changeCalendarMode(mode) {
    localStorage.setItem("dashboardCalendarMode", mode);
    setCalendarMode(mode);
    setCalendarDate(storedCalendarDate(mode));
  }

  function changeCalendarDate(nextDate) {
    persistCalendarDate(calendarMode, nextDate);
    setCalendarDate(nextDate);
  }

  return (
    <section className="section">
      <div className="grid stats-grid">
        <div className="card stat">
          <span>Клиенти</span>
          <strong>{data.stats.total_customers}</strong>
        </div>
        <div className="card stat">
          <span>Ремонти</span>
          <strong>{data.stats.total_repairs}</strong>
        </div>
        <div className={`card stat income-card ${isAdmin ? "stat-button" : "income-card-locked"}`} onClick={() => isAdmin && setShowIncome(!showIncome)}>
          <div className="income-card-head">
            <span>Приходи</span>
            {isAdmin && (
              <select
                value={incomePeriod}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => changeIncomePeriod(event.target.value)}
              >
                <option value="week">Седмица</option>
                <option value="month">Месец</option>
                <option value="three_months">3 месеца</option>
                <option value="year">Година</option>
              </select>
            )}
          </div>
          <strong>
            {isAdmin && showIncome ? money(data.stats.total_income) : "••••"}
          </strong>
          <small>{isAdmin ? (showIncome ? "Натисни за скриване" : "Натисни за показване") : "Само за админ"}</small>
        </div>
      </div>

      {isAdmin && (
        <div className="card mechanic-income-card">
          <div className="dashboard-card-head">
            <div>
              <h3>Приходи по майстор</h3>
              <p>{incomePeriodLabels[incomePeriod]}</p>
            </div>
          </div>
          {data.stats.mechanic_income?.length ? (
            <DataTable
              headers={["Майстор", "Ремонти", "Приход"]}
              rows={data.stats.mechanic_income.map((row) => [
                row.mechanic_name || "Без майстор",
                row.repair_count || 0,
                money(row.total_income),
              ])}
            />
          ) : (
            <p className="muted">Няма приходи за избрания период.</p>
          )}
        </div>
      )}

      <div className="card">
        <div className={`dashboard-calendar dashboard-calendar-${calendarMode === "month" ? "month" : "week"}-view`}>
          <div className="dashboard-calendar-head">
            <div>
              <h3>{calendarMode === "month" ? "Месечен календар" : "5-дневен календар"}</h3>
              <p>{calendarMode === "month"
                ? calendarDate.toLocaleDateString("bg-BG", { month: "long", year: "numeric" })
                : weekRangeLabel(calendarDate)}
              </p>
            </div>
            <div className="dashboard-calendar-actions">
              <div className="dashboard-calendar-toggle" role="group" aria-label="Изглед на календара">
                <button
                  className={`secondary small ${calendarMode === "week" ? "active" : ""}`}
                  onClick={() => changeCalendarMode("week")}
                  type="button"
                >
                  5 дни
                </button>
                <button
                  className={`secondary small ${calendarMode === "month" ? "active" : ""}`}
                  onClick={() => changeCalendarMode("month")}
                  type="button"
                >
                  Месец
                </button>
              </div>
              <div className="dashboard-calendar-controls">
                <button className="secondary small" onClick={() => changeCalendarDate(calendarMode === "month" ? addMonths(calendarDate, -1) : addDays(calendarDate, -7))} type="button">‹</button>
                <button className="secondary small" onClick={() => changeCalendarDate(new Date())} type="button">Днес</button>
                <button className="secondary small" onClick={() => changeCalendarDate(calendarMode === "month" ? addMonths(calendarDate, 1) : addDays(calendarDate, 7))} type="button">›</button>
              </div>
            </div>
          </div>
          <div className="dashboard-calendar-weekdays">
            {(calendarMode === "month" ? ["Пон", "Вто", "Сря", "Чет", "Пет", "Съб", "Нед"] : ["Пон", "Вто", "Сря", "Чет", "Пет"]).map((weekday, index) => (
              <span key={weekday}>
                {weekday}
                {calendarMode === "week" && calendar[index] && (
                  <small>{calendar[index].date.toLocaleDateString("bg-BG", { day: "numeric", month: "short" })}</small>
                )}
              </span>
            ))}
          </div>
          <div className="dashboard-calendar-grid">
            {calendar.map((day) => (
              <div
                className={`dashboard-calendar-day ${day.isCurrentMonth ? "" : "muted-day"} ${day.isToday ? "today" : ""}`}
                key={day.key}
              >
                <div className="dashboard-calendar-date">
                  <span>{calendarMode === "week" ? day.date.toLocaleDateString("bg-BG", { day: "numeric", month: "short" }) : day.date.getDate()}</span>
                  {day.appointments.length > 0 && <strong>{day.appointments.length}</strong>}
                </div>
                <div className="dashboard-calendar-items">
                  {day.appointments.map((appointment) => (
                    <button
                      className={`dashboard-calendar-appointment appointment-${appointment.status || "scheduled"}`}
                      key={appointment.id}
                      onClick={() => setSelectedAppointment(appointment)}
                      type="button"
                    >
                      <span>{appointmentTime(appointment.appointment_date)} · {appointment.customer_name || "-"}</span>
                      <small>{statusLabels[appointment.status] || appointment.status || "-"}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {selectedAppointment && (
        <Modal title="Детайли за запис" subtitle={formatDateTime(selectedAppointment.appointment_date)} onClose={() => setSelectedAppointment(null)}>
          <div className="appointment-modal-body">
            <strong className={`appointment-status status-${selectedAppointment.status || "scheduled"}`}>
              {statusLabels[selectedAppointment.status] || selectedAppointment.status || "-"}
            </strong>
            <p><b>Клиент:</b> {selectedAppointment.customer_name || "-"}</p>
            <p><b>Телефон:</b> {selectedAppointment.customer_phone || "-"}</p>
            <p><b>Автомобил:</b> {`${selectedAppointment.brand || ""} ${selectedAppointment.model || ""}`.trim() || "-"} {selectedAppointment.registration_number ? `(${selectedAppointment.registration_number})` : ""}</p>
            <p><b>Проблем:</b> {selectedAppointment.reason || "Без описание"}</p>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Customers({ isAdmin, setNotice }) {
  const { data, error, reload } = useApiData(() => apiRequest("/customers"), []);
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [editId, setEditId] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setFormError("");

    const validationError = validateCustomerForm(form);
    if (validationError) {
      setNotice("");
      setFormError(validationError);
      return;
    }

    await apiRequest(editId ? `/customers/${editId}` : "/customers", {
      method: editId ? "PUT" : "POST",
      body: JSON.stringify(form),
    });
    resetForm();
    setNotice(editId ? "Клиентът е обновен." : "Клиентът е добавен.");
    reload();
  }

  function resetForm() {
    setEditId(null);
    setForm({ full_name: "", phone: "" });
    setFormError("");
  }

  function editCustomer(customer) {
    setEditId(customer.id);
    setForm({
      full_name: customer.full_name || "",
      phone: customer.phone || "",
    });
  }

  async function remove(id) {
    if (!confirm("Да изтрия ли този клиент?")) return;
    await apiRequest(`/customers/${id}`, { method: "DELETE" });
    setNotice("Клиентът е изтрит.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const customers = data.filter((customer) =>
    `${customer.full_name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      {formError && <p className="notice error">{formError}</p>}
      <div className="grid two">
        <div className="card">
          <h3>{editId ? `Редакция на клиент #${editId}` : "Нов клиент"}</h3>
          <form className="form" onSubmit={submit} noValidate>
            <label>
              Име
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                minLength="2"
                pattern="[A-Za-zА-Яа-яЁёЀ-ӿ]+(?:[\s'-][A-Za-zА-Яа-яЁёЀ-ӿ]+)*"
                title="Само букви, интервал, тире или апостроф"
              />
            </label>
            <label>
              Телефон
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                inputMode="tel"
                pattern="(?:\+359|0)[\s-]*\(?[7-9]\d{2}\)?[\s-]*\d{3}[\s-]*\d{3}"
                title="Например 0888123456 или +359 888 123 456"
              />
            </label>
            <div className="actions">
              <button className="primary">{editId ? "Запази промените" : "Запази"}</button>
              <button className="secondary" type="button" onClick={resetForm}>Отказ</button>
            </div>
          </form>
        </div>
        <div className="card">
          <h3>Списък</h3>
          <input className="search" placeholder="Търси по име или телефон" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="customer-table records-scroll">
            <DataTable
              headers={["ID", "Име", "Телефон", ...(isAdmin ? ["Действия"] : [])]}
              rows={customers.map((customer) => [
                customer.id,
                <span title={customer.full_name}>{customer.full_name}</span>,
                customer.phone,
                ...(isAdmin
                  ? [
                      <div className="actions">
                        <button className="secondary small" onClick={() => editCustomer(customer)}>
                          Редактирай
                        </button>
                        <button className="danger small" onClick={() => remove(customer.id)}>
                          Изтрий
                        </button>
                      </div>,
                    ]
                  : []),
              ])}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function validateCustomerForm(form) {
  const name = String(form.full_name || "").trim();
  const phone = String(form.phone || "").trim();
  const namePattern = /^[A-Za-zА-Яа-яЁёЀ-ӿ]+(?:[\s'-][A-Za-zА-Яа-яЁёЀ-ӿ]+)*$/;
  const phonePattern = /^(?:\+359|0)[\s-]*\(?[7-9]\d{2}\)?[\s-]*\d{3}[\s-]*\d{3}$/;

  if (!namePattern.test(name) || name.length < 2) {
    return "Името трябва да съдържа само букви, интервал, тире или апостроф";
  }

  if (!phonePattern.test(phone)) {
    return "Телефонът трябва да е валиден български номер, например 0888123456 или +359 888 123 456";
  }

  return "";
}

function Cars({ isAdmin, setNotice, setView }) {
  const { data, error, reload } = useApiData(async () => {
    const [cars, customers, appointments] = await Promise.all([
      apiRequest("/cars"),
      apiRequest("/customers"),
      apiRequest("/appointments"),
    ]);
    return { cars, customers, appointments };
  }, []);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    brand: "",
    model: "",
    year: "",
    registration_number: "",
    vin: "",
    engine: "",
    mileage: "",
  });
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setFormError("");

    const validationError = validateCarForm(form);
    if (validationError) {
      setNotice("");
      setFormError(validationError);
      return;
    }

    await apiRequest(editId ? `/cars/${editId}` : "/cars", {
      method: editId ? "PUT" : "POST",
      body: JSON.stringify(form),
    });
    resetForm();
    setNotice(editId ? "Автомобилът е обновен." : "Автомобилът е добавен.");
    reload();
  }

  function resetForm() {
    setEditId(null);
    setForm({ customer_id: "", brand: "", model: "", year: "", registration_number: "", vin: "", engine: "", mileage: "" });
    setFormError("");
  }

  function editCar(car) {
    setEditId(car.id);
    setForm({
      customer_id: car.customer_id || "",
      brand: car.brand || "",
      model: car.model || "",
      year: car.year || "",
      registration_number: car.registration_number || "",
      vin: car.vin || "",
      engine: car.engine || "",
      mileage: car.mileage || "",
    });
  }

  function scheduleCar(car) {
    sessionStorage.setItem("appointmentDraft", JSON.stringify({
      customer_id: car.customer_id,
      car_id: car.id,
    }));
    setView("appointments");
  }

  async function remove(id) {
    if (!confirm("Да изтрия ли този автомобил?")) return;
    await apiRequest(`/cars/${id}`, { method: "DELETE" });
    setNotice("Автомобилът е изтрит.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const sortedCustomers = [...data.customers].sort((a, b) =>
    String(a.full_name || "").localeCompare(String(b.full_name || ""), "bg", { sensitivity: "base" })
  );
  const carsWithAppointments = new Set(
    data.appointments
      .filter((appointment) => appointment.status === "scheduled")
      .map((appointment) => String(appointment.car_id))
  );
  const cars = data.cars.filter((car) =>
    `${car.customer_name} ${car.brand} ${car.model} ${car.registration_number} ${car.vin}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="section">
      {formError && <p className="notice error">{formError}</p>}
      <div className="card">
        <h3>{editId ? `Редакция на автомобил #${editId}` : "Нов автомобил"}</h3>
        <form className="form" onSubmit={submit} noValidate>
          <div className="form-row">
            <label>
              Клиент
              <SearchableSelect
                value={form.customer_id}
                onChange={(value) => setForm({ ...form, customer_id: value })}
                placeholder="Избери клиент"
                searchPlaceholder="Търси клиент по име или телефон"
                items={sortedCustomers.map((customer) => ({
                  value: customer.id,
                  label: `${customer.full_name} - ${customer.phone || "без телефон"}`,
                }))}
              />
            </label>
            <label>
              Марка
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Модел
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                required
              />
            </label>
            <label>
              Година
              <input type="number" min="1900" max="2027" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Рег. номер
              <input
                value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value.toUpperCase() })}
                required
              />
            </label>
            <label>
              VIN
              <input
                maxLength="17"
                placeholder="17 символа"
                value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase().replace(/[IOQ]/g, "") })}
                pattern="[A-HJ-NPR-Z0-9]{17}"
                title="VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q."
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Двигател
              <input value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} />
            </label>
            <label>
              Километри
              <input type="number" min="0" max="2000000" step="1" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <button className="primary">{editId ? "Запази промените" : "Запази"}</button>
            <button className="secondary" type="button" onClick={resetForm}>Отказ</button>
          </div>
        </form>
      </div>
      <div className="card">
        <h3>Списък</h3>
        <div className="search-line car-search">
          <input placeholder="Търси по клиент, марка, модел, рег. номер или VIN" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className={`car-table records-scroll ${isAdmin ? "admin-car-table" : "mechanic-car-table"}`}>
          <DataTable
            headers={["ID", "Клиент", "Автомобил", "Рег. номер", "VIN", "Действия"]}
            rows={cars.map((car) => [
              car.id,
              <span title={car.customer_name}>{truncateText(car.customer_name, 20)}</span>,
              <span title={`${car.brand} ${car.model}`}>{truncateText(`${car.brand} ${car.model}`, 24)}</span>,
              <span title={car.registration_number || "-"}>{truncateText(car.registration_number || "-", 12)}</span>,
              <span title={car.vin || "-"}>{truncateText(car.vin || "-", isAdmin ? 14 : 17)}</span>,
              <div className="actions">
                <button
                  className={`secondary small car-appointment-button ${carsWithAppointments.has(String(car.id)) ? "saved" : ""}`}
                  title={carsWithAppointments.has(String(car.id)) ? "Има активен записан час" : "Запиши час в календара"}
                  onClick={() => scheduleCar(car)}
                >
                  Запиши час
                </button>
                {isAdmin && (
                  <>
                    <button className="secondary small" onClick={() => editCar(car)}>
                      Редактирай
                    </button>
                    <button className="danger small" onClick={() => remove(car.id)}>
                      Изтрий
                    </button>
                  </>
                )}
              </div>,
            ])}
          />
        </div>
      </div>
    </div>
  );
}

function Repairs({ isAdmin, setNotice }) {
  const { data, error, reload } = useApiData(async () => {
    const [repairs, cars, appointments] = await Promise.all([
      apiRequest("/repairs"),
      apiRequest("/cars"),
      apiRequest("/appointments"),
    ]);
    return { repairs, cars, appointments };
  }, []);
  const [selectedOpenRepairId, setSelectedOpenRepairId] = useState(() => sessionStorage.getItem("selectedRepairId") || "");
  const [detailRepairId, setDetailRepairId] = useState(null);
  const [editingRepairId, setEditingRepairId] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [startAppointmentId, setStartAppointmentId] = useState("");
  const [completedSearch, setCompletedSearch] = useState("");

  async function archiveRepair(id) {
    if (!confirm("Да архивирам ли този завършен ремонт? Данните, частите и фактурите ще останат запазени.")) return;
    await apiRequest(`/repairs/${id}`, { method: "DELETE" });
    setNotice("Ремонтът е архивиран.");
    reload();
  }

  async function removeOpenRepair(id) {
    if (!id) {
      setNotice("Първо избери ремонт.");
      return;
    }
    if (!confirm("Да премахна ли този започнат ремонт? Частите към него ще се изтрият, а часът от календара ще остане наличен.")) return;

    await apiRequest(`/repairs/${id}`, { method: "DELETE" });
    if (String(selectedOpenRepairId) === String(id)) {
      changeOpenRepair("");
    }
    setNotice("Започнатият ремонт е премахнат.");
    reload();
  }

  async function openInvoicePreview(id) {
    const repair = await apiRequest(`/repairs/${id}`);
    setInvoicePreview(repair);
    setNotice("Прегледай данните и потвърди издаването на фактурата.");
  }

  async function issueInvoice(id) {
    await apiRequest(`/invoice/${id}`);
    setInvoicePreview(null);
    setNotice("Фактурата е издадена.");
    reload();
  }

  function changeOpenRepair(id) {
    setSelectedOpenRepairId(id);
    if (id) {
      sessionStorage.setItem("selectedRepairId", id);
    } else {
      sessionStorage.removeItem("selectedRepairId");
    }
  }

  async function startRepair(event) {
    event.preventDefault();
    if (!startAppointmentId) return;

    const result = await apiRequest(`/appointments/${startAppointmentId}/start-repair`, { method: "POST" });
    if (result?.repair_id) {
      changeOpenRepair(String(result.repair_id));
    }
    setStartAppointmentId("");
    setNotice("Ремонтът е започнат от записания час.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const cancelledAppointmentIds = new Set(
    data.appointments.filter((appointment) => appointment.status === "cancelled").map((appointment) => String(appointment.id))
  );
  const repairAppointmentIds = new Set(data.repairs.map((repair) => String(repair.appointment_id)).filter(Boolean));
  const availableAppointments = data.appointments.filter((appointment) => {
    return appointment.status === "scheduled"
      && !repairAppointmentIds.has(String(appointment.id))
      && !Number(appointment.has_repair);
  });
  const openRepairs = data.repairs.filter((repair) => {
    return repair.status !== "completed" && !cancelledAppointmentIds.has(String(repair.appointment_id));
  });
  const completed = data.repairs.filter((repair) => repair.status === "completed");
  const selectedOpenRepairExists = openRepairs.some((repair) => String(repair.id) === String(selectedOpenRepairId));
  const activeSelectedRepairId = selectedOpenRepairExists ? selectedOpenRepairId : "";
  const filteredCompleted = completed
    .filter((repair) => `${repair.customer_name} ${repair.brand} ${repair.model} ${formatDate(repair.repair_date)}`.toLowerCase().includes(completedSearch.toLowerCase()))
    .sort((a, b) => {
      const dateDiff = new Date(b.completed_at || b.repair_date || b.created_at) - new Date(a.completed_at || a.repair_date || a.created_at);
      return dateDiff || Number(b.id || 0) - Number(a.id || 0);
    });

  return (
    <section className="section">
      <div className="card">
        <h3>Ремонт от календар</h3>
        {availableAppointments.length ? (
          <form className="form" onSubmit={startRepair}>
            <label>
              Записан час
              <SearchableSelect
                value={startAppointmentId}
                onChange={setStartAppointmentId}
                placeholder="Избери записан час"
                searchPlaceholder="Търси по дата, рег. номер или автомобил"
                items={availableAppointments.map((appointment) => ({
                  value: appointment.id,
                  label: `${formatDateTime(appointment.appointment_date)} - ${appointment.registration_number || "-"} - ${appointment.brand} ${appointment.model}`,
                }))}
              />
            </label>
            <button className="primary">Започни ремонт</button>
          </form>
        ) : (
          <p className="empty">Няма свободни записани часове от календара.</p>
        )}
      </div>

      <div className="card">
        <h3>Добави част</h3>
        {openRepairs.length ? (
          <>
            <label className="form repair-picker">
              Ремонт
              <select value={activeSelectedRepairId} onChange={(event) => changeOpenRepair(event.target.value)}>
                <option value="">Избери ремонт</option>
                {openRepairs.map((repair) => (
                  <option value={repair.id} key={repair.id}>
                    #{repair.id} - {repair.brand || "-"} {repair.model || ""} ({repair.registration_number || "-"}) - {formatDate(repair.repair_date)}
                  </option>
                ))}
              </select>
            </label>
            <div className="open-repair-toolbar">
              <button className="danger secondary open-repair-delete-button" type="button" disabled={!activeSelectedRepairId} onClick={() => removeOpenRepair(activeSelectedRepairId)}>
                Премахни започнат ремонт
              </button>
            </div>
            {activeSelectedRepairId ? (
              <RepairDetails
                repairId={activeSelectedRepairId}
                compact
                onChanged={() => {
                  reload();
                  setNotice("Ремонтът е обновен.");
                }}
                setNotice={setNotice}
                onFinish={() => updateRepairStatus(activeSelectedRepairId, "completed", reload, setNotice)}
              />
            ) : (
              <p className="empty">Избери ремонт, за да видиш добавените части.</p>
            )}
          </>
        ) : (
          <p className="empty">Първо започни ремонт от записан час в календара.</p>
        )}
      </div>

      <div className="card">
        <h3>Завършени ремонти</h3>
        <div className="search-line repair-search">
          <input placeholder="Търси по клиент, дата или автомобил" value={completedSearch} onChange={(event) => setCompletedSearch(event.target.value)} />
        </div>
        <div className={`repair-table completed-repair-table table-scroll list-scroll ${isAdmin ? "admin-repair-table" : "mechanic-repair-table"}`}>
          <DataTable
            headers={["ID", "Клиент", "Автомобил", "Дата", "Механик", "Сума", "Действия"]}
            rows={filteredCompleted.map((repair) => [
              repair.id,
              <span className="repair-two-line" title={repair.customer_name || "-"}>
                {twoLineNameParts(repair.customer_name).map((part) => <span key={part}>{part}</span>)}
              </span>,
              <span className="one-line" title={`${repair.brand || ""} ${repair.model || ""}`.trim()}>
                {`${repair.brand || ""} ${repair.model || ""}`.trim() || "-"}
              </span>,
              formatDate(repair.completed_at || repair.repair_date),
              <span className="repair-two-line" title={repair.mechanic_name || "-"}>
                {twoLineNameParts(repair.mechanic_name || "-").map((part) => <span key={part}>{part}</span>)}
              </span>,
              money(repair.total_price),
              <div className="actions">
                <button className="secondary small" onClick={() => setDetailRepairId(detailRepairId === repair.id ? null : repair.id)}>
                  Детайли
                </button>
                <button className="secondary small" onClick={() => setEditingRepairId(editingRepairId === repair.id ? null : repair.id)}>
                  Редактирай
                </button>
                {isAdmin && (
                  <>
                    {repair.invoice_id && repair.invoice_status !== "cancelled" ? (
                      <span className="muted action-note">Фактура издадена</span>
                    ) : (
                      <button className="secondary small" onClick={() => openInvoicePreview(repair.id)}>
                        Издай фактура
                      </button>
                    )}
                    <button className="danger small" onClick={() => archiveRepair(repair.id)}>
                      Архивирай
                    </button>
                  </>
                )}
              </div>,
            ])}
          />
        </div>
      </div>

      {detailRepairId && completed.some((repair) => repair.id === detailRepairId) && (
        <RepairDetails
          repairId={detailRepairId}
          onChanged={() => {
            reload();
            setNotice("Ремонтът е обновен.");
          }}
          setNotice={setNotice}
        />
      )}

      {editingRepairId && (
        <RepairEditor
          repairId={editingRepairId}
          cars={data.cars}
          onCancel={() => setEditingRepairId(null)}
          onSaved={() => {
            setEditingRepairId(null);
            reload();
            setNotice("Промените са запазени.");
          }}
        />
      )}

      {invoicePreview && (
        <InvoicePreviewModal
          repair={invoicePreview}
          onClose={() => setInvoicePreview(null)}
          onConfirm={() => issueInvoice(invoicePreview.id)}
        />
      )}
    </section>
  );
}

async function updateRepairStatus(id, status, reload, setNotice) {
  await apiRequest(`/repairs/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  setNotice(status === "completed" ? "Ремонтът е завършен." : "Статусът е обновен.");
  reload();
}

function RepairDetails({ repairId, compact = false, onChanged, setNotice, onFinish }) {
  const { data, error, reload } = useApiData(() => apiRequest(`/repairs/${repairId}`), [repairId]);
  const [partForm, setPartForm] = useState({ part_name: "", brand: "", quantity: 1, unit_price: 0 });
  const [laborForm, setLaborForm] = useState(null);

  useEffect(() => {
    if (!data || !compact) return;
    setLaborForm({
      car_id: data.car_id || "",
      repair_date: toInputDate(data.repair_date),
      mechanic_name: data.mechanic_name || "",
      description: data.description || "",
      status: data.status || "open",
      hours_worked: Math.max(1, Math.round(Number(data.hours_worked || 1))),
      price_per_hour: data.price_per_hour || 40,
    });
  }, [data, compact]);

  async function submitPart(event) {
    event.preventDefault();
    await apiRequest("/repair-parts", {
      method: "POST",
      body: JSON.stringify({ ...partForm, repair_id: repairId }),
    });
    setPartForm({ part_name: "", brand: "", quantity: 1, unit_price: 0 });
    setNotice("Частта е добавена.");
    reload();
    onChanged();
  }

  async function submitLabor(event) {
    event.preventDefault();
    await apiRequest(`/repairs/${repairId}`, {
      method: "PUT",
      body: JSON.stringify(laborForm),
    });
    setNotice("Трудът е обновен.");
    reload();
    onChanged();
  }

  async function finishRepair() {
    if (laborForm) {
      await apiRequest(`/repairs/${repairId}`, {
        method: "PUT",
        body: JSON.stringify(laborForm),
      });
    }
    await onFinish();
  }

  async function deletePart(partId) {
    if (!confirm("Да изтрия ли тази част?")) return;
    await apiRequest(`/repair-parts/${partId}`, { method: "DELETE" });
    setNotice("Частта е изтрита.");
    reload();
    onChanged();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const partsTotal = (data.parts || []).reduce((sum, part) => sum + Number(part.total_price || 0), 0);

  if (compact) {
    return (
      <div className="parts-panel">
        <form className="form repair-part-form" onSubmit={submitPart}>
          <div className="form-row">
            <label>
              Част
              <input value={partForm.part_name} onChange={(e) => setPartForm({ ...partForm, part_name: e.target.value })} required />
            </label>
            <label>
              Марка
              <input value={partForm.brand} onChange={(e) => setPartForm({ ...partForm, brand: e.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Брой
              <input type="number" min="1" step="1" value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} required />
            </label>
            <label>
              Ед. цена
              <input type="number" min="0" step="0.01" value={partForm.unit_price} onChange={(e) => setPartForm({ ...partForm, unit_price: e.target.value })} required />
            </label>
          </div>
          <button className="primary">Добави част</button>
        </form>

        {laborForm && (
          <div className="form labor-form">
            <h4>Труд</h4>
            <div className="form-row">
              <label>
                Труд (часове)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={laborForm.hours_worked}
                  onChange={(e) => setLaborForm({ ...laborForm, hours_worked: e.target.value })}
                />
              </label>
              <label>
                Цена на час
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborForm.price_per_hour}
                  onChange={(e) => setLaborForm({ ...laborForm, price_per_hour: e.target.value })}
                />
              </label>
            </div>
          </div>
        )}

        {(data.parts || []).length ? (
          <>
            <h4>Добавени части</h4>
            <DataTable
              headers={["Част", "Марка", "Брой", "Ед. цена", "Общо", "Действия"]}
              rows={(data.parts || []).map((part) => [
                part.part_name,
                part.brand || "-",
                part.quantity,
                money(part.unit_price),
                money(part.total_price),
                <button className="danger small" onClick={() => deletePart(part.id)}>Изтрий</button>,
              ])}
            />
            <p className="parts-total"><strong>Общо части:</strong> {money(partsTotal)}</p>
          </>
        ) : (
          <p className="empty">Още няма добавени части към този ремонт.</p>
        )}

        <div className="finish-repair-actions">
          <button className="secondary small finish-repair-button" type="button" onClick={finishRepair}>Завърши ремонт</button>
        </div>
      </div>
    );
  }

  const content = (
    <>
      <h3>Детайли за ремонт #{data.id}</h3>
      <div className="repair-summary">
        <p><b>Клиент:</b> {data.customer_name}</p>
        <p><b>Автомобил:</b> {data.brand} {data.model} ({data.registration_number})</p>
        <p><b>VIN:</b> {data.vin || "-"}</p>
        <p><b>Механик:</b> {data.mechanic_name || "-"}</p>
        <p><b>Труд:</b> {data.hours_worked || 0} ч. x {money(data.price_per_hour || 40)}</p>
        <p><b>Описание:</b> {data.description || "-"}</p>
      </div>

      <h4>Части към ремонта</h4>
      <DataTable
        headers={["Част", "Марка", "Бр.", "Ед. цена", "Общо"]}
        rows={(data.parts || []).map((part) => [
          part.part_name,
          part.brand || "-",
          part.quantity,
          money(part.unit_price),
          money(part.total_price),
        ])}
      />
    </>
  );

  return <div className="card">{content}</div>;
}

function RepairEditor({ repairId, cars, onCancel, onSaved }) {
  const { data, error, reload } = useApiData(() => apiRequest(`/repairs/${repairId}`), [repairId]);
  const [form, setForm] = useState(null);
  const [partEdit, setPartEdit] = useState(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      car_id: data.car_id || "",
      repair_date: toInputDate(data.repair_date),
      mechanic_name: data.mechanic_name || "",
      hours_worked: Math.round(Number(data.hours_worked || 1)),
      price_per_hour: data.price_per_hour || 40,
      status: data.status || "open",
      description: data.description || "",
    });
  }, [data]);

  async function submit(event) {
    event.preventDefault();
    await apiRequest(`/repairs/${repairId}`, {
      method: "PUT",
      body: JSON.stringify(form),
    });
    onSaved();
  }

  async function submitPart(event) {
    event.preventDefault();
    await apiRequest(`/repair-parts/${partEdit.id}`, {
      method: "PUT",
      body: JSON.stringify(partEdit),
    });
    setPartEdit(null);
    reload();
  }

  async function deletePart(partId) {
    if (!confirm("Да изтрия ли тази част от ремонта?")) return;
    await apiRequest(`/repair-parts/${partId}`, { method: "DELETE" });
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!form) return <LoadingCard />;

  if (partEdit) {
    return (
      <div className="card">
        <h3>Редакция на част #{partEdit.id}</h3>
        <form className="form" onSubmit={submitPart}>
          <div className="form-row">
            <label>
              Част
              <input value={partEdit.part_name} onChange={(e) => setPartEdit({ ...partEdit, part_name: e.target.value })} required />
            </label>
            <label>
              Марка
              <input value={partEdit.brand} onChange={(e) => setPartEdit({ ...partEdit, brand: e.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Брой
              <input type="number" min="1" step="1" value={partEdit.quantity} onChange={(e) => setPartEdit({ ...partEdit, quantity: e.target.value })} />
            </label>
            <label>
              Ед. цена
              <input type="number" min="0" step="0.01" value={partEdit.unit_price} onChange={(e) => setPartEdit({ ...partEdit, unit_price: e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <button className="primary">Запази част</button>
            <button className="secondary" type="button" onClick={() => setPartEdit(null)}>Отказ</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Редакция на ремонт #{repairId}</h3>
      <form className="form repair-edit-form" onSubmit={submit}>
        <label>
          Дата на ремонт
          <input type="date" value={form.repair_date} onChange={(e) => setForm({ ...form, repair_date: e.target.value })} required />
        </label>
        <label>
          Механик
          <input value={form.mechanic_name} onChange={(e) => setForm({ ...form, mechanic_name: e.target.value })} required />
        </label>
        <label>
          Труд (часове)
          <input type="number" min="1" step="1" value={form.hours_worked} onChange={(e) => setForm({ ...form, hours_worked: e.target.value })} required />
        </label>
        <label>
          Цена на час
          <input type="number" min="0" step="0.01" value={form.price_per_hour} onChange={(e) => setForm({ ...form, price_per_hour: e.target.value })} required />
        </label>
        <label className="span-full">
          Описание
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="actions span-full">
          <button className="primary">Запази промените</button>
          <button className="secondary" type="button" onClick={onCancel}>Отказ</button>
        </div>
      </form>
      <h4>Части към ремонта</h4>
      <div className="part-table">
        <DataTable
          headers={["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо", "Действия"]}
          rows={(data.parts || []).map((part) => [
            part.id,
            part.part_name,
            part.brand || "-",
            part.quantity,
            money(part.unit_price),
            money(part.total_price),
            <div className="actions">
              <button className="secondary small" type="button" onClick={() => setPartEdit({
                id: part.id,
                part_name: part.part_name || "",
                brand: part.brand || "",
                quantity: part.quantity || 1,
                unit_price: part.unit_price || 0,
              })}>
                Редактирай
              </button>
              <button className="danger small" type="button" onClick={() => deletePart(part.id)}>
                Изтрий
              </button>
            </div>,
          ])}
        />
      </div>
    </div>
  );
}

function InvoicePreviewModal({ repair, onClose, onConfirm }) {
  const parts = repair.parts || [];
  const partsTotal = parts.reduce((sum, part) => sum + Number(part.total_price || 0), 0);
  const finalTotal = Number(repair.labor_price || 0) + partsTotal;

  return (
    <Modal title="Преглед преди фактура" onClose={onClose}>
      <p className="muted">Ремонт #{repair.id}</p>
      <div className="invoice-preview-body">
        <div className="invoice-preview-grid">
          <p><strong>Клиент:</strong> <span className="invoice-preview-value" title={repair.customer_name || "-"}>{repair.customer_name || "-"}</span></p>
          <p><strong>Автомобил:</strong> <span className="invoice-preview-value" title={`${repair.brand || ""} ${repair.model || ""}`.trim() || "-"}>{`${repair.brand || ""} ${repair.model || ""}`.trim() || "-"}</span></p>
          <p><strong>Рег. номер:</strong> <span className="invoice-preview-value" title={repair.registration_number || "-"}>{repair.registration_number || "-"}</span></p>
          <p><strong>Механик:</strong> <span className="invoice-preview-value" title={repair.mechanic_name || "-"}>{repair.mechanic_name || "-"}</span></p>
          <p><strong>Труд:</strong> {repair.hours_worked || 0} ч. x {money(repair.price_per_hour || 0)}</p>
          <p><strong>Сума труд:</strong> {money(repair.labor_price || 0)}</p>
        </div>
        <div className="invoice-preview-description">
          <strong>Описание:</strong>
          <p>{repair.description || "-"}</p>
        </div>
        <div className="invoice-preview-parts">
          <h4>Части</h4>
          {parts.length ? (
            <DataTable
              headers={["Част", "Марка", "Бр.", "Ед. цена", "Общо"]}
              rows={parts.map((part) => [
                part.part_name,
                part.brand || "-",
                part.quantity,
                money(part.unit_price),
                money(part.total_price),
              ])}
            />
          ) : (
            <p className="empty">Няма добавени части.</p>
          )}
        </div>
        <div className="invoice-preview-total">
          <span>Крайна сума</span>
          <strong>{money(finalTotal)}</strong>
        </div>
        <div className="actions invoice-preview-actions">
          <button className="secondary" type="button" onClick={onClose}>Отказ</button>
          <button className="primary" type="button" onClick={onConfirm}>Потвърди и издай</button>
        </div>
      </div>
    </Modal>
  );
}

function toInputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputDate() {
  return toInputDate(new Date());
}

function validateAppointmentForm(form, appointments = []) {
  if (!form.customer_id || !form.car_id || !form.appointment_date_day || !form.appointment_date_time) {
    return "Клиент, автомобил, дата и час са задължителни";
  }

  const appointmentDate = new Date(`${form.appointment_date_day}T${form.appointment_date_time}`);

  if (Number.isNaN(appointmentDate.getTime())) {
    return "Невалидна дата и час";
  }

  if (appointmentDate <= new Date()) {
    return "Не може да се записва час със задна дата или минал час";
  }

  if (appointmentDate.getMinutes() % 30 !== 0 || appointmentDate.getSeconds() !== 0) {
    return "Часът трябва да бъде на 30 минути, например 09:00, 09:30 или 10:00";
  }

  const hasTakenSlot = appointments.some((appointment) => {
    if ((appointment.status || "scheduled") !== "scheduled") return false;
    const existingDate = new Date(String(appointment.appointment_date || "").replace(" ", "T"));
    if (Number.isNaN(existingDate.getTime())) return false;

    return Math.abs(existingDate.getTime() - appointmentDate.getTime()) < 30 * 60 * 1000;
  });

  if (hasTakenSlot) {
    return "Вече има записан час в този 30-минутен интервал";
  }

  return "";
}

function Appointments({ setNotice }) {
  const { data, error, reload } = useApiData(async () => {
    const [appointments, customers, cars] = await Promise.all([
      apiRequest("/appointments"),
      apiRequest("/customers"),
      apiRequest("/cars"),
    ]);

    return { appointments, customers, cars };
  }, []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem("appointmentStatusFilter") || "all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);
  const [statusDrafts, setStatusDrafts] = useState({});
  const [form, setForm] = useState(() => {
    let draft = {};
    try {
      draft = JSON.parse(sessionStorage.getItem("appointmentDraft") || "{}");
    } catch {
      draft = {};
    }
    sessionStorage.removeItem("appointmentDraft");

    return {
      customer_id: draft.customer_id || "",
      car_id: draft.car_id || "",
      appointment_date_day: "",
      appointment_date_time: "",
      reason: "",
      status: "scheduled",
    };
  });

  const availableCars = data?.cars.filter((car) => String(car.customer_id) === String(form.customer_id)) || [];

  async function submit(event) {
    event.preventDefault();
    const validationError = validateAppointmentForm(form, data.appointments);
    if (validationError) {
      setNotice(validationError, true);
      return;
    }

    try {
      await apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id,
          car_id: form.car_id,
          appointment_date: `${form.appointment_date_day} ${form.appointment_date_time}`,
          reason: form.reason,
          status: form.status,
        }),
      });
      setForm({ customer_id: "", car_id: "", appointment_date_day: "", appointment_date_time: "", reason: "", status: "scheduled" });
      setNotice("Часът е записан.");
      reload();
    } catch (error) {
      setNotice(error.message || "Грешка при записване на час", true);
    }
  }

  async function updateStatus(id, status) {
    await apiRequest(`/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setNotice("Статусът е обновен.");
    setStatusDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    reload();
  }

  async function remove(id) {
    if (!confirm("Да изтрия ли този час?")) return;
    await apiRequest(`/appointments/${id}`, { method: "DELETE" });
    setNotice("Часът е изтрит.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  const appointments = data.appointments
    .filter((appointment) => {
      const status = appointment.status || "scheduled";
      if (statusFilter !== "all" && status !== statusFilter) return false;

      return `${appointment.customer_name} ${appointment.brand} ${appointment.model} ${appointment.registration_number} ${appointment.reason} ${statusLabels[status]}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

  function changeStatusFilter(value) {
    setStatusFilter(value);
    sessionStorage.setItem("appointmentStatusFilter", value);
  }

  return (
    <>
      <div className="section">
        <div className="card">
          <h3>Нов час</h3>
          <form className="form" onSubmit={submit}>
            <label>
              Клиент
              <SearchableSelect
                value={form.customer_id}
                onChange={(value) => setForm({ ...form, customer_id: value, car_id: "" })}
                placeholder="Избери клиент"
                searchPlaceholder="Търси клиент по име или телефон"
                items={[...data.customers]
                  .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "bg", { sensitivity: "base" }))
                  .map((customer) => ({
                    value: customer.id,
                    label: `${customer.full_name} - ${customer.phone || "без телефон"}`,
                  }))}
              />
            </label>
            <label>
              Автомобил
              <SearchableSelect
                value={form.car_id}
                onChange={(value) => setForm({ ...form, car_id: value })}
                placeholder="Избери автомобил"
                searchPlaceholder="Търси по марка, модел или рег. номер"
                items={availableCars.map((car) => ({
                  value: car.id,
                  label: `${car.brand} ${car.model} - ${car.registration_number || "-"}`,
                }))}
              />
            </label>
            <div className="form-row">
              <label>
                Дата
                <input
                  type="date"
                  min={todayInputDate()}
                  value={form.appointment_date_day}
                  onChange={(event) => setForm({ ...form, appointment_date_day: event.target.value })}
                  required
                />
              </label>
              <label>
                Час
                <input
                  type="time"
                  step="1800"
                  value={form.appointment_date_time}
                  onChange={(event) => setForm({ ...form, appointment_date_time: event.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Причина
              <textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </label>
            <button className="primary">Запази</button>
          </form>
        </div>
        <div className="card">
          <div className="appointment-list-head">
            <h3>Записани часове</h3>
            <div className="appointment-filter">
              <button
                className="secondary small appointment-filter-button"
                type="button"
                aria-haspopup="true"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
              >
                <span>{appointmentStatusFilters.find((filter) => filter.value === statusFilter)?.label || "Всички"}</span>
                <span className="appointment-filter-caret" aria-hidden="true">▾</span>
              </button>
              {!filterOpen ? null : (
                <div className="appointment-filter-menu">
                  {appointmentStatusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      className={`appointment-filter-option ${filter.value === statusFilter ? "active" : ""}`}
                      type="button"
                      aria-pressed={filter.value === statusFilter}
                      onClick={() => {
                        changeStatusFilter(filter.value);
                        setFilterOpen(false);
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="search-line calendar-search">
            <input placeholder="Търси по клиент, автомобил, рег. номер или причина" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="table-scroll list-scroll">
            <table className="appointment-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Автомобил</th>
                  <th>Причина</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr><td className="empty" colSpan="6">Няма записи.</td></tr>
                ) : appointments.map((appointment) => {
                  const draftStatus = statusDrafts[appointment.id] || appointment.status || "scheduled";

                  return (
                    <tr key={appointment.id}>
                      <td>{formatDateTime(appointment.appointment_date)}</td>
                      <td>
                        <span className="appointment-customer-name" title={appointment.customer_name || "-"}>
                          {twoLineNameParts(appointment.customer_name).map((part) => <span key={part}>{part}</span>)}
                        </span>
                      </td>
                      <td>
                        <span className="appointment-car" title={`${appointment.brand || ""} ${appointment.model || ""}`.trim()}>
                          {appointment.brand} {appointment.model}
                        </span>
                        <span className="muted appointment-registration" title={appointment.registration_number || "-"}>
                          {appointment.registration_number || "-"}
                        </span>
                      </td>
                      <td>
                        <button className="appointment-reason" type="button" title={appointment.reason || "-"} onClick={() => setReasonModal(appointment)}>
                          {appointment.reason || "-"}
                        </button>
                      </td>
                      <td>
                        <select
                          className="status-select"
                          value={draftStatus}
                          onChange={(event) => setStatusDrafts({ ...statusDrafts, [appointment.id]: event.target.value })}
                        >
                          <option value="scheduled">Записан</option>
                          <option value="completed">Завършен</option>
                          <option value="cancelled">Отказан</option>
                        </select>
                      </td>
                      <td>
                        <div className="actions appointment-actions">
                          <button className="secondary small" onClick={() => updateStatus(appointment.id, draftStatus)}>Запази</button>
                          <button className="danger small" onClick={() => remove(appointment.id)}>Изтрий</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {reasonModal && (
        <Modal title="Причина за запис" subtitle={formatDateTime(reasonModal.appointment_date)} onClose={() => setReasonModal(null)}>
          <div className="appointment-modal-body">
            <p><b>Клиент:</b> {reasonModal.customer_name || "-"}</p>
            <p>
              <b>Автомобил:</b>{" "}
              {`${reasonModal.brand || ""} ${reasonModal.model || ""}`.trim() || "-"}{" "}
              {reasonModal.registration_number ? `(${reasonModal.registration_number})` : ""}
            </p>
            <div className="reason-modal-text">{reasonModal.reason || "Няма въведена причина."}</div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Invoices({ isAdmin, setNotice }) {
  const { data, error, reload } = useApiData(() => apiRequest("/invoices"), []);

  async function cancelInvoice(id) {
    if (!confirm("Да анулирам ли тази фактура? PDF файлът и записът ще останат запазени.")) return;
    await apiRequest(`/invoices/${id}/cancel`, { method: "PATCH" });
    setNotice("Фактурата е анулирана.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  return (
    <div className="section">
      <div className="card">
        <h3>Издадени фактури</h3>
        <div className="table-scroll list-scroll">
          <table className="invoice-table">
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
              {data.length === 0 ? (
                <tr><td className="empty" colSpan="6">Няма записи</td></tr>
              ) : data.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>
                    <span className="invoice-cell-text" title={invoice.customer_name || "-"}>
                      {invoice.customer_name || "-"}
                    </span>
                  </td>
                  <td>
                    <span className="invoice-cell-text" title={`${invoice.brand || ""} ${invoice.model || ""}`.trim() || "-"}>
                      {`${invoice.brand || ""} ${invoice.model || ""}`.trim() || "-"}
                    </span>
                  </td>
                  <td>{money(invoice.total_amount)}</td>
                  <td>
                    <span className={`invoice-status ${invoice.status === "cancelled" ? "status-cancelled" : "status-issued"}`}>
                      {invoice.status === "cancelled" ? "Анулирана" : "Издадена"}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <a className="secondary small button-link" href={`http://localhost:3000/${invoice.pdf_path}`} target="_blank">
                        Отвори
                      </a>
                      {isAdmin && invoice.status !== "cancelled" && (
                        <button className="danger small" onClick={() => cancelInvoice(invoice.id)}>
                          Анулирай
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Archive({ setNotice }) {
  const { data, error, reload } = useApiData(async () => {
    const [repairs, invoices] = await Promise.all([
      apiRequest("/repairs/archive"),
      apiRequest("/invoices/archive"),
    ]);

    return { repairs, invoices };
  }, []);
  const [detailRepairId, setDetailRepairId] = useState(null);

  async function restoreRepair(repairId) {
    if (!confirm("Да върна ли този ремонт в завършени ремонти?")) return;

    await apiRequest(`/repairs/${repairId}/restore`, { method: "PATCH" });
    setNotice("Ремонтът е възстановен.");
    setDetailRepairId(null);
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  return (
    <section className="section">
      <div className="card">
        <h3>Архивирани ремонти</h3>
        <div className="repair-table archive-repair-list table-scroll list-scroll">
          {data.repairs.length === 0 ? (
            <p className="empty">Няма архивирани ремонти.</p>
          ) : (
            <DataTable
              headers={["ID", "Клиент", "Автомобил", "Дата", "Механик", "Сума", "Архивиран", "Действия"]}
              rows={data.repairs.map((repair) => [
                repair.id,
                repair.customer_name,
                `${repair.brand} ${repair.model}`,
                formatDate(repair.repair_date),
                repair.mechanic_name || "-",
                money(repair.total_price),
                formatDate(repair.archived_at),
                <div className="actions">
                  <button className="secondary small" onClick={() => setDetailRepairId(detailRepairId === repair.id ? null : repair.id)}>
                    Детайли
                  </button>
                  <button className="secondary small" onClick={() => restoreRepair(repair.id)}>
                    Възстанови
                  </button>
                </div>,
              ])}
            />
          )}
        </div>
      </div>

      {detailRepairId && (
        <ArchiveRepairDetails repairId={detailRepairId} />
      )}

      <div className="card">
        <h3>Анулирани фактури</h3>
        {data.invoices.length === 0 ? (
          <p className="empty">Няма анулирани фактури.</p>
        ) : (
          <div className="table-scroll list-scroll">
            <table className="invoice-table">
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
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{truncateText(invoice.invoice_number, 26)}</td>
                    <td>{truncateText(invoice.customer_name, 26)}</td>
                    <td>{truncateText(`${invoice.brand} ${invoice.model}`, 28)}</td>
                    <td>{money(invoice.total_amount)}</td>
                    <td><span className="invoice-status status-cancelled">Анулирана</span></td>
                    <td>
                      <div className="actions">
                        <a className="secondary small button-link" href={`http://localhost:3000/${invoice.pdf_path}`} target="_blank">
                          Отвори
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ArchiveRepairDetails({ repairId }) {
  const { data, error } = useApiData(() => apiRequest(`/repairs/${repairId}`), [repairId]);

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  return (
    <div className="card">
      <h3>Детайли за архивиран ремонт #{data.id}</h3>
      <div className="grid two">
        <p><strong>Клиент:</strong> {data.customer_name}</p>
        <p><strong>Автомобил:</strong> {data.brand} {data.model}</p>
        <p><strong>Рег. номер:</strong> {data.registration_number || "-"}</p>
        <p><strong>Механик:</strong> {data.mechanic_name || "-"}</p>
        <p><strong>Дата:</strong> {formatDate(data.repair_date)}</p>
        <p><strong>Архивиран:</strong> {formatDate(data.archived_at)}</p>
        <p><strong>Труд:</strong> {data.hours_worked || 0} ч. x {money(data.price_per_hour || 0)}</p>
        <p><strong>Сума труд:</strong> {money(data.labor_price || 0)}</p>
        <p><strong>Крайна сума:</strong> {money(data.total_price)}</p>
      </div>
      <p>{data.description || ""}</p>
      <div className="part-table">
        <DataTable
          headers={["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо"]}
          rows={(data.parts || []).map((part) => [
            part.id,
            part.part_name,
            part.brand || "-",
            part.quantity,
            money(part.unit_price),
            money(part.total_price),
          ])}
        />
      </div>
    </div>
  );
}

function Users({ setNotice }) {
  const { data, error, reload } = useApiData(() => apiRequest("/users"), []);
  const [form, setForm] = useState({ username: "", role: "mechanic" });

  async function submit(event) {
    event.preventDefault();
    await apiRequest("/users", { method: "POST", body: JSON.stringify(form) });
    setForm({ username: "", role: "mechanic" });
    setNotice("Потребителят е създаден.");
    reload();
  }

  async function remove(id) {
    if (!confirm("Да изтрия ли този потребител?")) return;
    await apiRequest(`/users/${id}`, { method: "DELETE" });
    setNotice("Потребителят е изтрит.");
    reload();
  }

  if (error) return <ErrorCard message={error} />;
  if (!data) return <LoadingCard />;

  return (
    <div className="grid two">
      <div className="card">
        <h3>Нов потребител</h3>
        <form className="form" onSubmit={submit}>
          <label>
            Потребителско име
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoComplete="off" />
          </label>
          <label>
            Роля
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="mechanic">Механик</option>
              <option value="admin">Админ</option>
            </select>
          </label>
          <button className="primary">Създай потребител</button>
        </form>
      </div>
      <div className="card">
        <h3>Списък</h3>
        <div className="user-table table-scroll list-scroll">
          <DataTable
            headers={["Потребител", "Роля", "Статус", "Действия"]}
            rows={data.map((user) => [
              truncateText(user.username, 28),
              user.role === "admin" ? "Админ" : "Механик",
              user.has_password ? "Парола зададена" : "Очаква парола",
              user.id === JSON.parse(sessionStorage.getItem("user") || "null")?.id
                ? <span className="muted">Текущ акаунт</span>
                : <button className="danger small" onClick={() => remove(user.id)}>Изтрий</button>,
            ])}
          />
        </div>
      </div>
    </div>
  );
}

function SearchableSelect({
  value,
  onChange,
  items,
  placeholder = "Избери",
  searchPlaceholder = placeholder,
  required = true,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => String(item.value ?? "") === String(value ?? ""));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter((item) => String(item.label ?? "").toLowerCase().includes(normalizedQuery))
    : items;

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label || "");
    }
  }, [selected?.label, open]);

  function chooseItem(item) {
    onChange(String(item.value ?? ""));
    setQuery(String(item.label ?? ""));
    setOpen(false);
  }

  return (
    <div className="searchable-select" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <input
        className="select-display"
        type="search"
        placeholder={searchPlaceholder}
        autoComplete="off"
        required={required}
        value={open ? query : selected?.label || ""}
        onFocus={() => {
          setQuery(selected?.label || "");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
      />
      <select
        className="native-select-hidden"
        tabIndex="-1"
        aria-hidden="true"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option value={item.value} key={item.value}>{item.label}</option>
        ))}
      </select>
      {open && (
        <div className="select-menu">
          {visibleItems.length ? visibleItems.map((item) => (
            <button
              className={`select-option ${String(item.value) === String(value) ? "active" : ""}`}
              type="button"
              key={item.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseItem(item)}
            >
              {item.label}
            </button>
          )) : <div className="select-empty">Няма резултати</div>}
        </div>
      )}
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="empty">Няма записи</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="secondary small" onClick={onClose}>Затвори</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function storedCalendarDate(mode) {
  if (mode === "month") {
    const value = localStorage.getItem("dashboardMonth");
    if (value && /^\d{4}-\d{2}$/.test(value)) {
      const [year, month] = value.split("-").map(Number);
      return new Date(year, month - 1, 1);
    }
  }

  const value = localStorage.getItem("dashboardWeekStart");
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date();
}

function persistCalendarDate(mode, value) {
  if (mode === "month") {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    localStorage.setItem("dashboardMonth", `${year}-${month}`);
    return;
  }

  localStorage.setItem("dashboardWeekStart", dateKey(startOfWorkWeek(value)));
}

function addMonths(value, amount) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function startOfWorkWeek(value) {
  const date = new Date(value);
  const dayIndex = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - dayIndex);
  return date;
}

function weekRangeLabel(value) {
  const start = startOfWorkWeek(value);
  const end = addDays(start, 4);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function twoLineNameParts(value) {
  const parts = String(value || "-").trim().split(/\s+/);
  if (parts.length <= 1) return [parts[0] || "-"];
  return [parts[0], parts.slice(1).join(" ")];
}

function validateCarForm(form) {
  const brand = String(form.brand || "").trim();
  const model = String(form.model || "").trim();
  const registrationNumber = String(form.registration_number || "").trim().toUpperCase();
  const vin = String(form.vin || "").trim().toUpperCase();
  const year = String(form.year || "").trim();
  const mileage = String(form.mileage || "").trim();
  const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;

  if (!brand) {
    return "Марката е задължителна";
  }

  if (!model) {
    return "Моделът е задължителен";
  }

  if (!registrationNumber) {
    return "Рег. номерът е задължителен";
  }

  if (vin && !vinPattern.test(vin)) {
    return "VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q";
  }

  if (year) {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2027) {
      return "Годината трябва да бъде между 1900 и 2027";
    }
  }

  if (mileage) {
    const numericMileage = Number(mileage);
    if (!Number.isInteger(numericMileage) || numericMileage < 0 || numericMileage > 2000000) {
      return "Километрите трябва да бъдат цяло число между 0 и 2000000";
    }
  }

  return "";
}

function truncateText(value, maxLength) {
  const text = String(value || "-");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function appointmentTime(value) {
  return new Date(value).toLocaleTimeString("bg-BG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWeekCalendar(weekDate, appointments) {
  const start = startOfWorkWeek(weekDate);
  const todayKey = dateKey(new Date());
  const grouped = appointments.reduce((result, appointment) => {
    const key = dateKey(appointment.appointment_date);
    result[key] = result[key] || [];
    result[key].push(appointment);
    return result;
  }, {});

  Object.values(grouped).forEach((items) => {
    items.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));
  });

  return Array.from({ length: 5 }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);

    return {
      key,
      date,
      isCurrentMonth: true,
      isToday: key === todayKey,
      appointments: grouped[key] || [],
    };
  });
}

function buildMonthCalendar(monthDate, appointments) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const todayKey = dateKey(new Date());
  const grouped = appointments.reduce((result, appointment) => {
    const key = dateKey(appointment.appointment_date);
    result[key] = result[key] || [];
    result[key].push(appointment);
    return result;
  }, {});

  Object.values(grouped).forEach((items) => {
    items.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));
  });

  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);

    return {
      key,
      date,
      isCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
      appointments: grouped[key] || [],
    };
  });
}

function LoadingCard() {
  return <div className="card">Зареждане...</div>;
}

function ErrorCard({ message }) {
  return <div className="card error-text">{message}</div>;
}

export default App;
