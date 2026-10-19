use crate::auth::{Auth, Error, Result};
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRoute {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub url: String,
    pub icon: Option<String>,
    pub order: i64,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Deserialize)]
pub struct Routes {
    pub routes: Vec<ApiRoute>,
}
#[derive(Deserialize)]
pub struct OneRoute {
    pub route: ApiRoute,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Create {
    pub name: String,
    pub url: String,
    pub icon: Option<String>,
    pub order: Option<i64>,
    pub metadata: Option<serde_json::Value>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i64>,
}
pub fn endpoint(base: &str, id: Option<&str>) -> Result<url::Url> {
    let mut u = crate::config::secure_endpoint(base)?;
    {
        let mut p = u
            .path_segments_mut()
            .map_err(|_| Error::from("Invalid API URL"))?;
        p.pop_if_empty().push("routes");
        if let Some(id) = id {
            p.push(id);
        }
    }
    Ok(u)
}
pub async fn request(
    auth: &mut Auth,
    method: reqwest::Method,
    id: Option<&str>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let token = auth.token().await?;
    let url = endpoint(&auth.config.api_base_url, id)?;
    let mut request = auth.client.request(method, url).bearer_auth(token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| Error::from("Omnia backend unavailable or timed out"))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        if status == 401 || status == 403 {
            auth.logout()?;
        }
        return Err(Error {
            message: format!("Omnia backend HTTP {status}"),
            status: Some(status),
        });
    }
    if status == 204 {
        return Ok(serde_json::Value::Null);
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| Error::from("Backend response interrupted"))?;
    if bytes.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid Omnia backend response".into())
}
pub async fn list(auth: &mut Auth) -> Result<Vec<ApiRoute>> {
    let mut result = Err(Error::from("Route list failed"));
    for delay in [0, 750, 2000] {
        if delay > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }
        result = request(auth, reqwest::Method::GET, None, None).await;
        if result.is_ok()
            || result
                .as_ref()
                .is_err_and(|e| matches!(e.status, Some(400..=499)))
        {
            break;
        }
    }
    let mut routes = serde_json::from_value::<Routes>(result?)
        .map_err(|_| Error::from("Invalid routes contract"))?
        .routes;
    routes.sort_by_key(|r| r.order);
    Ok(routes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn route_id_cannot_escape_endpoint() {
        assert_eq!(
            endpoint("http://127.0.0.1:7890", Some("a/b?x"))
                .unwrap()
                .as_str(),
            "http://127.0.0.1:7890/routes/a%2Fb%3Fx"
        );
    }
    #[test]
    fn preserves_optional_metadata() {
        let c = Create {
            name: "Work".into(),
            url: "https://example.com".into(),
            icon: Some("link".into()),
            order: Some(2),
            metadata: Some(serde_json::json!({"openExternalLinksInBrowser":true})),
        };
        assert_eq!(
            serde_json::to_value(c).unwrap()["metadata"]["openExternalLinksInBrowser"],
            true
        );
    }
}
