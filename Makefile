PROJECT=./example_project
MANAGE=python $(PROJECT)/manage.py
PORT=14327

help: ## Shows this help
	@echo "$$(grep -h '#\{2\}' $(MAKEFILE_LIST) | sed 's/: #\{2\} /	/' | column -t -s '	')"


# TODO actually write some tests
test:
	$(MANAGE) test tx_elevators


resetdb: ## Reset the dev database
	$(MANAGE) reset_db --router=default --noinput
	$(MANAGE) migrate --noinput

# Note that `geocode` will still re-lookup bad addresses
#
# To restore: `django loadgeo data/geocoding.csv`
dumpgeo: ## Dump building geo data
	$(MANAGE) dumpgeo > data/geocoding.csv

loadgeo: ## Load saved geo data
	$(MANAGE) loadgeo data/geocoding.csv

scrape: ## Scrape new data
	cd data && $(MAKE) $(MFLAGS) clean elevator_data_file.csv
	python tx_elevators/scripts/scrape.py data/elevator_data_file.csv
	@echo "should geocode the top 1000 too: $(MANAGE) geocode"

# timing for trivial import real	1m51.994s
# timing for a fresh import real	4m15.279s
import:
	python tx_elevators/scripts/scrape.py data/elevator_data_file.csv


web/start:
	$(MANAGE) collectstatic --noinput
	DEBUG=0 $(MANAGE) runserver $(PORT) --nothreading --noreload & echo $$! > web.pid
	sleep 1

web/stop: web.pid
	# pkill -P $$(cat web.pid)
	kill $$(cat web.pid)
	rm web.pid


# FINISHED --2013-04-01 00:10:54--
# Total wall clock time: 43m 29s
# Downloaded: 24343 files, 92M in 5.3s (17.3 MB/s)
#
# FINISHED --2014-11-01 16:38:55--
# Total wall clock time: 9m 4s
# Downloaded: 25615 files, 120M in 0.8s (150 MB/s)
#
# FINISHED --2016-04-01 04:48:54--
# Total wall clock time: 4m 59s
# Downloaded: 26757 files, 126M in 0.1s (971 MB/s)
site: ## Scrape the site
site: web/start
	mkdir -p ._site
	cd ._site && wget -r localhost:$(PORT) --force-html -e robots=off -nH -nv --max-redirect 0 || true
	@$(MAKE) web/stop

serve: ## Serve from the scraped site on port 8088
	cd ._site && python -m SimpleHTTPServer 8088

upload: ## Upload the scraped site to s3
	aws s3 sync ._site s3://$(AWS_BUCKET_NAME)/ \
	  --cache-control "max-age=2592000" \
	  --acl "public-read"
