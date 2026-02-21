package com.example.entityserver;

/**
 * EntityServerClient 사용 예제
 *
 * 컴파일 및 실행:
 *   javac EntityServerClient.java EntityServerExample.java
 *   ENTITY_SERVER_URL=http://localhost:47200 \
 *   ENTITY_SERVER_API_KEY=mykey \
 *   ENTITY_SERVER_HMAC_SECRET=mysecret \
 *   java EntityServerExample
 */
public class EntityServerExample {

    public static void main(String[] args) throws Exception {
        EntityServerClient es = new EntityServerClient();

        // 목록 조회
        String list = es.list("product", 1, 20, null);
        System.out.println("List: " + list);

        // 생성
        String created = es.submit("product", "{\"name\":\"노트북\",\"price\":1500000,\"category\":\"electronics\"}");
        System.out.println("Created: " + created);

        // 단건 조회
        String item = es.get("product", 1);
        System.out.println("Get: " + item);

        // 수정 (seq 포함)
        String updated = es.submit("product", "{\"seq\":1,\"name\":\"게이밍 노트북\",\"price\":2000000}");
        System.out.println("Updated: " + updated);

        // 필터 검색
        String results = es.query("product",
            "[{\"field\":\"category\",\"op\":\"eq\",\"value\":\"electronics\"}]",
            1, 10
        );
        System.out.println("Query: " + results);

        // 이력 조회
        String history = es.history("product", 1, 1, 20);
        System.out.println("History: " + history);

        // 삭제
        String deleted = es.delete("product", 1);
        System.out.println("Deleted: " + deleted);
    }
}
