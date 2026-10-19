use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Bounds {
    pub fn validate(&self) -> Result<(), String> {
        if [self.x, self.y, self.width, self.height]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.0 && *n <= 32768.0)
            && self.width >= 1.0
            && self.height >= 1.0
        {
            Ok(())
        } else {
            Err("Invalid logical bounds".into())
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_reject_nan_and_negative() {
        assert!(Bounds {
            x: 0.,
            y: 0.,
            width: 10.,
            height: 20.
        }
        .validate()
        .is_ok());
        assert!(Bounds {
            x: f64::NAN,
            y: 0.,
            width: 10.,
            height: 20.
        }
        .validate()
        .is_err());
        assert!(Bounds {
            x: 0.,
            y: 0.,
            width: -1.,
            height: 20.
        }
        .validate()
        .is_err());
    }
}
