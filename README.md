# Auto Service

Уеб приложение за управление на автосервиз. Системата позволява управление на клиенти, автомобили, записани часове, ремонти и фактури.

## Необходими програми

Преди стартиране трябва да са инсталирани:

- Node.js 18 или по-нова версия
- npm
- MySQL Server
- Git

Проверка:

```bash
node -v
npm -v
git --version
mysql --version
```

## Клониране на проекта

```bash
git clone https://github.com/nikcata/auto-service.git
cd auto-service
```

## Настройка на базата данни

Стартирайте MySQL Server.

Създайте базата чрез файла `schema.sql`:

```bash
cd backend
mysql -u root -p < database/schema.sql
```

## Настройка на backend

В папка `backend` създайте файл `.env`:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=auto_service_db
JWT_SECRET=change_this_to_a_long_random_secret
```

Инсталиране на зависимости:

```bash
cd backend
npm install
```

Стартиране на backend:

```bash
npm start
```

Backend сървърът работи на:

```text
http://localhost:3000
```

## Настройка на frontend

Отворете втори терминал:

```bash
cd frontend-react
npm install
npm run dev
```

React приложението работи на:

```text
http://localhost:5173
```

## Създаване на първи администратор

След създаване на базата трябва да има потребител с роля `admin`.

Може да се добави чрез MySQL:

```sql
USE auto_service_db;

INSERT INTO users (username, password, role)
VALUES ('admin', NULL, 'admin');
```

След това от екрана за вход в приложението използвайте бутона:

```text
Задай/смени парола
```

Задайте парола за потребителя `admin`, след което влезте в системата.

## Стартиране на проекта

Трябва да работят два процеса.

Backend:

```bash
cd backend
npm start
```

Frontend:

```bash
cd frontend-react
npm run dev
```

След това отворете:

```text
http://localhost:5173
```