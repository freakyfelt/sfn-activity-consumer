.PHONY: build shell test

build:
	docker compose build test

test:
	docker compose run --rm test npm run test

shell:
	docker compose run --rm test sh
