<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

class EntityServer extends BaseConfig
{
    public string $baseUrl = 'http://localhost:47200';
    public string $apiKey = '';
    public string $hmacSecret = '';
    public int $timeout = 10;
    public bool $requireEncryptedRequest = true;
}
