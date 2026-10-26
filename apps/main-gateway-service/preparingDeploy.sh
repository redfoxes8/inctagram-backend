#!/bin/bash
sed -i -e "s/REGISTRY_HOSTNAME/$1/g"  ./apps/main-gateway-service/deployment.yaml
sed -i -E -e "s/(^|[^[:alnum:]_])PROJECT([^[:alnum:]_]|$)/\1$2\2/g" ./apps/main-gateway-service/deployment.yaml
sed -i -e "s/TAG_VERSION/$3/g" ./apps/main-gateway-service/deployment.yaml
sed -i -e "s/DEPLOYMENT_NAME/$4/g" ./apps/main-gateway-service/deployment.yaml
sed -i -e "s/PORT_CONTAINER/$5/g" ./apps/main-gateway-service/deployment.yaml
sed -i -e "s/NAMESPACE/$6/g" ./apps/main-gateway-service/deployment.yaml
sed -i -E -e "s/(^|[^[:alnum:]_])PROJECT([^[:alnum:]_]|$)/\1$2\2/g" ./apps/main-gateway-service/service.yaml
sed -i -e "s/NAMESPACE/$6/g" ./apps/main-gateway-service/service.yaml
