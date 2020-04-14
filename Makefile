styles = $(shell find styles -maxdepth 1 -name \*.scss)
stylesheets = $(patsubst styles/%.scss,pub/%.css,$(styles))
includes = $(shell find styles/inc -name \*.scss)
sass = node_modules/.bin/node-sass

default: build

build: styles

styles: $(stylesheets)

clean:
	rm -fr pub/*

pub/%.css: styles/%.scss $(includes)
	$(sass) $< > $@

.PHONY: default build clean styles
