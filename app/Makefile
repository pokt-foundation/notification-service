build-NotifyEndpointUsage:
	npm install
# workaround https://github.com/aws/aws-sam-cli/issues/2565
	npm rebuild
	npm run fast-compile
	npm prune --production
ifeq ($(OS),Windows_NT)
	Xcopy /E dist/functions/notify-endpoint-usage $(ARTIFACTS_DIR)
	Xcopy /E node_modules $(ARTIFACTS_DIR)
else
	cp -R dist/functions/notify-endpoint-usage $(ARTIFACTS_DIR)
	cp -R dist/lib $(ARTIFACTS_DIR)
	cp -R node_modules $(ARTIFACTS_DIR)
endif
