.PHONY: build test

build:
	docker compose build test

test:
	docker compose run --rm test npm run test