ARG LITELLM_TAG=v1.93.0
FROM ghcr.io/berriai/litellm:${LITELLM_TAG}

# `aws login` profiles use Botocore's login credential provider, which needs CRT.
RUN python -m ensurepip \
    && python -m pip install --no-cache-dir "botocore[crt]"

# Keep the Mantle compatibility patch used by the existing LiteLLM deployment.
COPY patch_litellm_mantle.py /tmp/patch_litellm_mantle.py
RUN python /tmp/patch_litellm_mantle.py \
    && rm /tmp/patch_litellm_mantle.py
