"""
EntityServerClient 사용 예제

실행:
    pip install requests
    ENTITY_SERVER_URL=http://localhost:47200 \
    ENTITY_SERVER_API_KEY=mykey \
    ENTITY_SERVER_HMAC_SECRET=mysecret \
    python example.py
"""

from entity_server import EntityServerClient

es = EntityServerClient()

# 목록 조회
result = es.list("product", page=1, limit=10)
print(f"List: {result.get('data', {}).get('total', 0)} items")

# 생성
created = es.submit("product", {
    "name":     "무선 마우스",
    "price":    45000,
    "category": "peripherals",
})
seq = created.get("seq")
print(f"Created seq: {seq}")

# 단건 조회
item = es.get("product", seq)
print(f"Get: {item['data']['name']}")

# 수정 (seq 포함)
es.submit("product", {"seq": seq, "price": 39000})
print("Updated")

# 커스텀 SQL 검색
results = es.query("product",
    sql="SELECT seq, name, category FROM product WHERE category = ?",
    params=["peripherals"],
    limit=5,
)
print(f"Query: {len(results.get('data', {}).get('items', []))} results")

# 이력 조회
hist = es.history("product", seq)
print(f"History: {hist.get('data', {}).get('total', 0)} entries")

# 삭제
es.delete("product", seq)
print("Deleted")
