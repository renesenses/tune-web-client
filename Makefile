.PHONY: build clean install dev

PREFIX ?= /usr/share/tune-web-client
NODE_ENV ?= production

build: node_modules
	npm run build

node_modules: package.json
	npm ci

dev: node_modules
	npm run dev

clean:
	rm -rf dist node_modules

install: build
	install -d $(DESTDIR)$(PREFIX)
	cp -r dist/* $(DESTDIR)$(PREFIX)/

uninstall:
	rm -rf $(DESTDIR)$(PREFIX)

# Packaging targets
deb:
	./build-deb.sh

tarball: build
	tar czf tune-web-client-$(shell node -p "require('./package.json').version").tar.gz -C dist .
