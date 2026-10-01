<?php
/**
 * Настройки API «Christine».
 * По умолчанию используется SQLite — ничего настраивать не нужно.
 * Для MySQL поменяйте 'driver' => 'mysql' и заполните блок 'mysql'.
 */
return [
    'db' => [
        'driver' => 'sqlite', // 'sqlite' или 'mysql'

        // Где хранить файл базы SQLite. Скрипт попробует пути по порядку и возьмёт первый доступный для записи.
        // Первый вариант — папка УРОВНЕМ ВЫШЕ корня сайта (безопаснее всего), второй — api/data (закрыта .htaccess).
        'sqlite_paths' => [
            __DIR__ . '/../../christine-data/christine.sqlite',
            __DIR__ . '/data/christine.sqlite',
        ],

        'mysql' => [
            'host'    => 'localhost',
            'port'    => 3306,
            'name'    => 'hangul',
            'user'    => 'root',
            'pass'    => '',
            'charset' => 'utf8mb4',
        ],
    ],

    // Вход через Google: Client ID из Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application).
    // В «Authorized JavaScript origins» добавьте адрес сайта, например https://christine.ru
    // Пусто — кнопка Google не показывается.
    'google_client_id' => '932249165646-6o0upqj4jbnjr3qjumkdkmcsbigjpc3v.apps.googleusercontent.com',

    // Сколько дней живёт сессия
    'token_ttl_days' => 90,

    // Защита рейтинга от накруток
    'max_xp_per_request' => 400,   // максимум XP за одно сохранение
    'max_xp_per_day'     => 4000,  // максимум XP в сутки
    'import_xp_cap'      => 3000,  // сколько гостевого XP можно перенести при регистрации

    // Ограничение попыток входа: N попыток за M минут с одного IP
    'login_attempts' => 10,
    'login_window_min' => 10,
];
