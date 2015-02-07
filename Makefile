PROJECT=./example_project
MANAGE=python $(PROJECT)/manage.py
SITE_URL=localhost:8000

help:
	@echo "make commands:"
	@echo "  make help    - this help"
	@echo "  make test    - run test suite"
	@echo "  make resetdb - drop and recreate the database"
	@echo "  make scrape  - get data and import"
	@echo "  make import  - import data"
	@echo "  make site    - spider $(SITE_URL) and save pages locally"
	@echo "  make upload  - sync spidered pages to S3"
	@echo "  make serve   - serve the spided pages locally (on port 8088)"


test:
	$(MANAGE) test tx_elevators


resetdb:
	$(MANAGE) reset_db --router=default --noinput
	$(MANAGE) syncdb --noinput


# Backup the local database
#
# To restore
#   cat tx_elevators-2014-08-31.dump | \
#   docker run --rm --link postgis:postgis -t crccheck/postgis \
#   pg_restore -U docker -h postgis --dbname elevators
dumpdb:
	docker run --rm --link postgis:postgis -t crccheck/postgis \
	  pg_dump -U docker -h postgis -p 5432 -Fc elevators > tx_elevators-$$(date +"%Y-%m-%d").dump

# Dump building geocodes
#
# Note that `geocode` will still re-lookup bad addresses
#
# To restore: `django loadgeo data/geocoding.csv`
dumpgeo:
	$(MANAGE) dumpgeo > data/geocoding.csv

scrape:
	cd data && $(MAKE) $(MFLAGS) clean elevator_data_file.csv
	python tx_elevators/scripts/scrape.py data/elevator_data_file.csv
	@echo "should geocode the top 1000 too: $(MANAGE) geocode"


import:
	python tx_elevators/scripts/scrape.py data/elevator_data_file.csv


dbpush:
	test $(SCP_DUMP)
	test $(SCP_URL)
	pg_dump -Fc --no-acl --no-owner tx_elevators > tx_elevators.dump
	scp tx_elevators.dump $(SCP_DUMP)
	heroku pgbackups:restore DATABASE $(SCP_URL)
	rm tx_elevators.dump


# FINISHED --2013-04-01 00:10:54--
# Total wall clock time: 43m 29s
# Downloaded: 24343 files, 92M in 5.3s (17.3 MB/s)
#
# FINISHED --2014-11-01 16:38:55--
# Total wall clock time: 9m 4s
# Downloaded: 25615 files, 120M in 0.8s (150 MB/s)
site:
	bin/download_site.sh

serve:
	cd site && python -m SimpleHTTPServer 8088

# 24340 files uploaded.
# 3 files skipped.
# real	200m23.933s

# 25611 files uploaded.
# 2662 files skipped.
# real	122m28.098s
upload:
	LOGGING=WARN DEBUG=0 $(MANAGE) sync_s3 --dir site --gzip

# requires installing https://github.com/twpayne/s3-parallel-put
# uses 8 threads by default
#
# INFO:s3-parallel-put[statter-12800]:put 137686194 bytes in 28270 files in 697.4 seconds (197436 bytes/s, 40.5 files/s)
upload2:
	cd site && s3-parallel-put --bucket=${AWS_BUCKET_NAME} \
	  --grant public-read --header "Cache-Control:max-age=2592000" --gzip  .


.PHONY: help test resetdb scrape pushdb site upload serve

# DOCKER #
build:
	docker build -t texastribune/elevators .

shell:
	docker run --rm --name elevators -i -t --link pgplus:postgis \
	  --volumes-from elevators-wsgi \
	  --env-file env-docker --entrypoint /bin/bash texastribune/elevators

gunicorn:
	docker run --detach --name elevators-wsgi --link pgplus:postgis \
	  --env-file env-docker -p 8000:8000 texastribune/elevators

# download script doesn't need concurrency so only use -c 1
benchmark: gunicorn
	sleep 5
	docker run --rm --link elevators-wsgi:wsgi -t \
	  zz ab -n 10 http://wsgi:8000/
	docker logs elevators-wsgi
	docker rm -f elevators-wsgi
