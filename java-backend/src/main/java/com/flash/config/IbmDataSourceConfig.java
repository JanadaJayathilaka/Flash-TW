package com.flash.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
public class IbmDataSourceConfig {

    @Value("${ibm.jdbc.url}")
    private String url;

    @Value("${ibm.jdbc.username}")
    private String username;

    @Value("${ibm.jdbc.password}")
    private String password;

    @Value("${ibm.jdbc.pool.max-size:5}")
    private int maxPoolSize;

    @Value("${ibm.jdbc.pool.min-idle:1}")
    private int minIdle;

    @Value("${ibm.jdbc.pool.connection-timeout:30000}")
    private long connectionTimeout;

    @Bean(name = "ibmDataSource")
    public DataSource ibmDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName("com.ibm.as400.access.AS400JDBCDriver");
        config.setMaximumPoolSize(maxPoolSize);
        config.setMinimumIdle(minIdle);
        config.setConnectionTimeout(connectionTimeout);
        config.setPoolName("IBM-i-Pool");
        return new HikariDataSource(config);
    }

    @Bean(name = "ibmJdbcTemplate")
    public JdbcTemplate ibmJdbcTemplate() {
        return new JdbcTemplate(ibmDataSource());
    }
}
