# Handshake

Handshake, AI model dosyalarini yukleyip IPFS ve Avalanche Fuji uzerinde provenance bilgisiyle takip etmek icin gelistirilen bir monorepo uygulamasidir.

Repo ana parcalari:

- `apps/web`: Next.js web arayuzu
- `apps/api`: NestJS API
- `packages/types`: paylasilan tipler ve DTO'lar
- `packages/contracts`: ModelRegistry kontrati ve ABI/deployment bilgileri

## Gereksinimler

- Node.js `>=20`
- pnpm `>=10`
- MongoDB URI'si
- Pinata hesabi ve JWT bilgisi
- On-chain ozellikleri icin Avalanche Fuji RPC bilgisi

## Kurulum

Bagimliliklari kur:

```bash
pnpm install
```

Env dosyasini olustur:

```bash
cp .env.example .env
```

Minimum local `.env` degerleri:

```bash
MONGO_URI=mongodb://localhost:27017/handshake
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
CHAIN_ID=43113

PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=your_gateway_domain
```

On-chain ayarlari icin `.env.example` icindeki varsayilan Fuji RPC kullanilabilir. `MODEL_REGISTRY_ADDRESS` bos birakilirsa deployment dosyasindaki adres kullanilir.

## Calistirma

Tum workspace'i dev modda baslat:

```bash
pnpm dev
```

Adresler:

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/docs

## Faydali Komutlar

```bash
pnpm build
pnpm check-types
pnpm --filter @handshake/api check-types
pnpm --filter @handshake/web check-types
pnpm --filter @handshake/types build
```

Contract paketini tek basina build etmek icin:

```bash
pnpm --filter @handshake/contracts build
```

## Docker Deployment

Production deployment icin repo iki image kullanir:

- `handshake-api:local`
- `handshake-web:local`

Caddy, `WEB_DOMAIN` ve `API_DOMAIN` ile web/API reverse proxy ve HTTPS terminasyonunu yapar. Deployment env degerleri `.env.example` dosyasindaki alanlara gore doldurulur.

Sunucuda image'lar hazirsa uygulamayi baslatmak icin:

```bash
docker compose up -d --no-build
```

GitHub Actions workflow'u `master` push'unda image'lari `linux/amd64` olarak build eder, Droplet'e yukler ve `docker compose up -d --no-build` ile deploy eder.

## Sorun Giderme

Pull sonrasi `Cannot find module` hatasi alirsan:

```bash
pnpm install
```

`3000` veya `4000` portu doluysa eski dev process'lerini kapatip tekrar calistir.

Disk dolduysa ve Next cache buyuduyse generated cache'i silebilirsin:

```bash
rm -rf apps/web/.next
```
