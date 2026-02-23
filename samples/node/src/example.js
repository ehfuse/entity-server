import { EntityServerClient } from "./EntityServerClient.js";

const es = new EntityServerClient({
    baseUrl: process.env.ENTITY_SERVER_URL ?? "http://localhost:47200",
    apiKey: process.env.ENTITY_SERVER_API_KEY ?? "mykey",
    hmacSecret: process.env.ENTITY_SERVER_HMAC_SECRET ?? "mysecret",
});

// 목록 조회
const list = await es.list("product", { page: 1, limit: 10 });
console.log("List:", list.data?.length, "items");

// 생성
const created = await es.submit("product", {
    name: "무선 키보드",
    price: 89000,
    category: "peripherals",
});
console.log("Created seq:", created.seq);

// 수정 (seq 포함)
await es.submit("product", { seq: created.seq, price: 79000 });
console.log("Updated");

// 필터 검색
const results = await es.query(
    "product",
    [{ field: "category", op: "eq", value: "peripherals" }],
    { page: 1, limit: 5 },
);
console.log("Query results:", results.data?.length);

// 이력 조회
const hist = await es.history("product", created.seq);
console.log("History count:", hist.data?.length);

// 삭제
await es.delete("product", created.seq);
console.log("Deleted");
